import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import {
  Upload as UploadIcon, FileText, ArrowLeft, CheckCircle,
  Loader2, Trash2, X, BookOpen, Zap, ChevronRight, Eye, EyeOff, RefreshCw
} from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";

const STEPS = ["Upload", "Configure", "Generate"];

const QUESTION_COUNT = 45;

// ─── AI Processing Limits ───────────────────────────────────────────────────
// File upload size limits (MB)
const MAX_PDF_MB = 15;       // PDFs: up to 15 MB (text extraction handles large files)
const MAX_PPT_MB = 25;       // PPT/PPTX: up to 25 MB (slides often embed images)
const MAX_IMAGE_MB = 5;      // Images: 5 MB max for reliable OCR
const MAX_DOC_MB = 10;       // DOC/DOCX/TXT: 10 MB

// Text length limits
const MAX_TEXT_WORDS = 8000;       // Max words for pasted text input
const MAX_AI_CONTENT_CHARS = 50000; // Max chars sent to AI (~12k words / ~16k tokens — safe context limit)

// Supported file extensions
const SUPPORTED_EXTENSIONS = [".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"];

function isTextMeaningful(text) {
  if (!text || text.trim().length < 30) return false;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) return false;
  // Accept math/science content with numbers/symbols
  const hasMath = /[\d=+\-*/^()]+/.test(text);
  if (hasMath) return true;
  // Check that a reasonable portion of "words" look like real words (not random chars)
  const realWords = words.filter(w => w.length >= 2 && /[a-zA-Z]{2,}/.test(w));
  if (realWords.length / words.length < 0.25) return false;
  // Detect random-character strings: avg word length > 12 is suspicious
  const avgLen = realWords.reduce((s, w) => s + w.length, 0) / (realWords.length || 1);
  if (avgLen > 14) return false;
  return true;
}

function getFileType(file) {
  if (!file) return "text";
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "doc";
  return "text"; // .txt
}

function isSupportedFile(file) {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
}

// File types supported by ExtractDataFromUploadedFile
const EXTRACTABLE_TYPES = ["pdf", "pptx", "image"];

function FileIcon({ type }) {
  const icons = { pdf: "📄", pptx: "📊", image: "🖼️", text: "📝", doc: "📝" };
  return <span className="text-2xl">{icons[type] || "📄"}</span>;
}

export default function Upload() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  // Step state
  const [step, setStep] = useState(0); // 0=upload, 1=configure, 2=generating
  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState(null);
  const [extraImages, setExtraImages] = useState([]);
  const [extractedContent, setExtractedContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  // difficulty removed — now chosen per game session

  // Progress
  const [progressStep, setProgressStep] = useState(""); // current generation step label
  const [progressPct, setProgressPct] = useState(0);
  const [done, setDone] = useState(null); // { count, title }
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const dropRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      return base44.entities.StudyMaterial.filter({ user_id: u.email });
    }).then(setMaterials).catch(() => base44.auth.redirectToLogin(createPageUrl("Upload")))
      .finally(() => setLoading(false));
  }, []);

  // Drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleFileSelect = (f) => {
    if (!isSupportedFile(f)) {
      setError("Unsupported file format. Please upload a PDF, PPT, DOC, TXT, or image file (.jpg, .jpeg, .png).");
      return;
    }
    const type = getFileType(f);
    const sizeMB = f.size / (1024 * 1024);
    const maxMB = type === "pdf" ? MAX_PDF_MB : type === "pptx" ? MAX_PPT_MB : type === "image" ? MAX_IMAGE_MB : MAX_DOC_MB;
    if (sizeMB > maxMB) {
      setError(`File size exceeds the maximum allowed limit of ${maxMB} MB.`);
      return;
    }
    setFile(f);
    setError("");
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  };

  const removeFile = () => { setFile(null); setExtractedContent(""); };

  const textWords = textContent.trim().split(/\s+/).filter(w => w.length > 0).length;
  const canProceedStep0 = file || (textContent.trim().length > 20 && textWords <= MAX_TEXT_WORDS) || extraImages.length > 0;

  const canProceedStep1 = title.trim().length > 0;

  const handleNext = async () => {
    if (step === 0) {
      if (!canProceedStep0) { setError("Please upload a file or paste at least 20 characters of notes."); return; }
      setError("");
      setStep(1);
    } else if (step === 1) {
      if (!canProceedStep1) { setError("Please enter a title for this material."); return; }
      setError("");
      await runGeneration();
    }
  };

  const runGeneration = async () => {
    setStep(2);
    setProgressPct(0);
    setProgressStep("Uploading file...");

    let content = textContent;

    // Validate pasted text word count
    if (!file && extraImages.length === 0) {
      const inputWords = content.trim().split(/\s+/).filter(w => w.length > 0).length;
      if (inputWords > MAX_TEXT_WORDS) {
        setError(`The input exceeds the maximum limit of ${MAX_TEXT_WORDS.toLocaleString()} words. Please shorten the content.`);
        setStep(1); return;
      }
    }

    try {
      if (file) {
        const fileType = getFileType(file);

        if (!EXTRACTABLE_TYPES.includes(fileType)) {
          // .txt, .doc, .docx — read as plain text
          setProgressStep("Reading file content...");
          setProgressPct(20);
          const textFromFile = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || "");
            reader.onerror = () => reject(new Error("Failed to read file."));
            reader.readAsText(file);
          });
          if (!textFromFile || textFromFile.trim().length < 50) {
            setError("Failed to extract text from the uploaded document. Please try a PDF or paste your text directly.");
            setStep(1); return;
          }
          if (!isTextMeaningful(textFromFile)) {
            setError("Questions cannot be generated because the uploaded material does not contain meaningful or readable study content.");
            setStep(1); return;
          }
          content = textFromFile;
          setExtractedContent(content);
          setProgressPct(45);
        } else {
          setProgressStep("Extracting text from file...");
          setProgressPct(15);
          let file_url;
          try {
            const uploadResult = await base44.integrations.Core.UploadFile({ file });
            file_url = uploadResult.file_url;
          } catch {
            setError("Failed to upload the file. Please check your connection and try again.");
            setStep(1); return;
          }
          setProgressPct(30);

          // For images: first use LLM to check if it contains educational content
          if (fileType === "image") {
            setProgressStep("Checking image content...");
            const imageCheck = await base44.integrations.Core.InvokeLLM({
              prompt: `Look at this image carefully. Does it contain readable educational content such as text, notes, study material, slides, diagrams with labels, screenshots of lessons, or any written information useful for studying?\n\nRespond only with a JSON object.`,
              file_urls: [file_url],
              response_json_schema: {
                type: "object",
                properties: {
                  has_educational_content: { type: "boolean" },
                  reason: { type: "string" }
                },
                required: ["has_educational_content"]
              }
            });
            if (!imageCheck.has_educational_content) {
              setError("Questions cannot be generated because the uploaded image does not contain readable study information.");
              setStep(1); return;
            }
          }

          let result;
          try {
            result = await base44.integrations.Core.ExtractDataFromUploadedFile({
              file_url,
              json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
            });
          } catch {
            // Fallback: LLM-based extraction
            try {
              const llmResult = await base44.integrations.Core.InvokeLLM({
                prompt: `Extract all readable text content from this document. Return all text including titles, headings, paragraphs, bullet points, formulas. Do not summarize — return raw text as-is.`,
                file_urls: [file_url],
                response_json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
              });
              if (llmResult?.text && llmResult.text.trim().length >= 30) {
                result = { status: "success", output: { text: llmResult.text } };
              } else {
                setError("Failed to extract text from the uploaded document. Please try pasting your text directly.");
                setStep(1); return;
              }
            } catch {
              setError("Failed to extract text from the uploaded document. Please try pasting your text directly.");
              setStep(1); return;
            }
          }

          if (result.status === "success" && result.output?.text) {
            const extracted = result.output.text;
            if (!extracted || extracted.trim().length < 30) {
              setError("No readable text detected in this file. Please upload a document with readable content.");
              setStep(1); return;
            }
            if (!isTextMeaningful(extracted)) {
              setError("Questions cannot be generated because the uploaded material does not contain meaningful or readable study content.");
              setStep(1); return;
            }
            // No word limit for PDF/PPT — just use full extracted content (trimmed to AI context limit)
            content = extracted;
            setExtractedContent(content);
          } else if (!content) {
            setError("Failed to extract text from the uploaded document. Please ensure it contains readable text.");
            setStep(1); return;
          }
          setProgressPct(45);
        }
      } else if (extraImages.length > 0) {
        setProgressStep("Checking image content...");
        setProgressPct(15);
        const img = extraImages[0];
        let file_url;
        try {
          const uploadResult = await base44.integrations.Core.UploadFile({ file: img });
          file_url = uploadResult.file_url;
        } catch {
          setError("Failed to upload the image. Please check your connection and try again.");
          setStep(1); return;
        }

        // Check if image has educational content before extracting
        const imageCheck = await base44.integrations.Core.InvokeLLM({
          prompt: `Look at this image carefully. Does it contain readable educational content such as text, notes, study material, slides, diagrams with labels, screenshots of lessons, or any written information useful for studying?\n\nRespond only with a JSON object.`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              has_educational_content: { type: "boolean" },
              reason: { type: "string" }
            },
            required: ["has_educational_content"]
          }
        });
        if (!imageCheck.has_educational_content) {
          setError("Questions cannot be generated because the uploaded image does not contain readable study information.");
          setStep(1); return;
        }

        setProgressStep("Extracting text from image...");
        setProgressPct(30);
        let result;
        try {
          result = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
          });
        } catch {
          setError("Failed to extract text from the image.");
          setStep(1); return;
        }
        if (result.status === "success" && result.output?.text && result.output.text.trim().length >= 30) {
          if (!isTextMeaningful(result.output.text)) {
            setError("Questions cannot be generated because the uploaded image does not contain readable study information.");
            setStep(1); return;
          }
          content = result.output.text;
          setExtractedContent(content);
        } else {
          setError("No readable text detected in the image. Please upload an image with clear, readable text.");
          setStep(1); return;
        }
        setProgressPct(45);
      }

      // Final check: ensure we have content to send to AI
      if (!content || content.trim().length < 30) {
        setError("No content available to generate questions from. Please provide text or upload a valid file.");
        setStep(1); return;
      }

      setProgressStep("Saving material...");
      setProgressPct(50);
      const material = await base44.entities.StudyMaterial.create({
        user_id: user.email,
        title: title.trim(),
        content,
        file_type: file ? getFileType(file) : "text"
      });

      setProgressStep("Analyzing content & generating questions...");
      setProgressPct(60);

      const count = QUESTION_COUNT;

      const prompt = `You are an expert educational question generator for a gamified learning app. Create high-quality study questions STRICTLY based on the provided material.

This material may have been extracted from a PDF, PowerPoint, images, or math/science documents. Support ALL content types including:
- Lectures, notes, textbooks
- Mathematical formulas and equations (e.g. "Solve for x: 2x + 5 = 15" → answer: x = 5)
- Science concepts with symbols, variables, and numbers
- Slide titles, bullet points, diagrams, and notes

═══════════════════════════════════
STUDY MATERIAL:
═══════════════════════════════════
${content.slice(0, 14000)}
═══════════════════════════════════

TASK: Generate exactly ${count} questions split across three difficulty levels.

DIFFICULTY DISTRIBUTION AND QUESTION TYPES — STRICTLY FOLLOW THESE RULES:

EASY (~35%, ~${Math.round(count * 0.35)} questions):
- question_type MUST be "multiple_choice" ONLY. No other types allowed.
- Exactly 4 answer options (1 correct + 3 plausible distractors).
- Test basic recall of facts and definitions.
- Include a short helpful hint.
- Set difficulty="easy".

MEDIUM (~40%, ~${Math.round(count * 0.40)} questions):
- question_type MUST be "identification" ONLY. No other types allowed.
- A direct question expecting a specific name, term, value, or person.
- Example: "What planet is known as the Red Planet?" → Answer: "Mars"
- options array must be empty [].
- Include a structural hint.
- Set difficulty="medium".

HARD (~25%, ~${Math.round(count * 0.25)} questions):
- Mix of ALL four types: multiple_choice, identification, enumeration, fill_blank.
- Spread evenly: roughly equal amounts of each type.
- Test deep understanding and analysis.
- NO hints (set hint to "").
- Set difficulty="hard".

QUESTION TYPE FORMAT RULES:
- multiple_choice: exactly 4 options array. correct_answer = the correct option text.
- identification: empty options []. Direct question with a specific answer (name, term, formula, person, value).
- enumeration: empty options []. correct_answer = comma-separated key terms. Example: "Solid, Liquid, Gas"
- fill_blank: empty options []. question_text must contain ___ for the blank. correct_answer = exact missing word/phrase.

MATH & SCIENCE SUPPORT:
- If material contains equations or formulas, generate questions that ask students to solve, identify, or complete them.
- Use fill_blank or identification for math problems (e.g. "Solve: 2x + 5 = 15" → "x = 5").

GLOBAL RULES:
1. Every question must be directly answerable from the material above. NO external knowledge.
2. Cover a WIDE variety of topics — spread across the entire material.
3. Each question must be unique — never repeat the same concept.
4. Explanations: 1-2 sentences explaining WHY the answer is correct.
5. "topic" = short 2-4 word label (e.g. "Cell Division", "Algebra Equations").
6. Never generate trick questions or ambiguous answers.

Generate exactly ${count} questions now.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          required: ["questions"],
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                required: ["question_text", "question_type", "correct_answer", "explanation", "topic"],
                properties: {
                  question_text: { type: "string" },
                  question_type: { type: "string", enum: ["multiple_choice", "enumeration", "fill_blank", "identification"] },
                  options: { type: "array", items: { type: "string" } },
                  correct_answer: { type: "string" },
                  explanation: { type: "string" },
                  topic: { type: "string" },
                  hint: { type: "string" }
                }
              }
            }
          }
        }
      });

      setProgressStep("Saving questions...");
      setProgressPct(85);

      const questions = response.questions || [];
      if (questions.length > 0) {
        await base44.entities.Question.bulkCreate(
          questions.map(q => ({
            ...q,
            material_id: material.id,
            user_id: user.email,
            difficulty: q.difficulty || "medium",
            options: q.options || [],
            hint: q.hint || ""
          }))
        );
        await base44.entities.StudyMaterial.update(material.id, { question_count: questions.length });
      }

      setProgressPct(100);
      setProgressStep("Done!");
      setDone({ count: questions.length, title: title.trim() });

      const mats = await base44.entities.StudyMaterial.filter({ user_id: user.email });
      setMaterials(mats);
    } catch (e) {
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError("AI service request failed. Please try again in a moment.");
      }
      setStep(1);
    }
  };

  const resetForm = () => {
    setStep(0); setTitle(""); setTextContent(""); setFile(null);
    setExtractedContent(""); setDone(null); setError(""); setProgressPct(0);
  };

  const deleteMaterial = async (id) => {
    await base44.entities.StudyMaterial.delete(id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3 sticky top-0 bg-[#0a0a0f]/90 backdrop-blur-sm z-10">
        <MobileNav profile={null} />
        <h1 className="text-lg font-bold">Upload Materials</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">

        {/* Step Indicator */}
        {step < 2 && (
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 text-sm font-medium transition-colors ${i === step ? "text-violet-400" : i < step ? "text-white/60" : "text-white/20"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${i === step ? "bg-violet-600 border-violet-500" : i < step ? "bg-white/20 border-white/20" : "border-white/10"}`}>
                    {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {s}
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-white/15" />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 0: Upload Content */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Add your study material</h2>
              <p className="text-white/40 text-sm">Upload a file or paste your notes below</p>
            </div>

            {/* Drop Zone */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fileInput").click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                dragging ? "border-violet-500 bg-violet-500/10" :
                file ? "border-violet-500/40 bg-violet-500/5 cursor-default" : "border-white/10 hover:border-violet-500/40 hover:bg-white/3"
              }`}
            >
              <input id="fileInput" type="file" accept=".pdf,.pptx,.ppt,.doc,.docx,.txt,.jpg,.jpeg,.png" className="hidden"
                onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0])} />

              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <FileIcon type={getFileType(file)} />
                  <div className="text-left">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">{(file.size / 1024).toFixed(0)} KB · {getFileType(file).toUpperCase()}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(); }}
                    className="ml-2 p-1.5 bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <UploadIcon className="w-10 h-10 mx-auto mb-3 text-white/20" />
                  <p className="font-medium text-white/60 mb-1">Drop your file here or click to browse</p>
                  <p className="text-xs text-white/30">PDF, PPT, DOC, TXT, JPG, PNG</p>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-xs text-white/30 font-medium">OR</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* File size limits info */}
            <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs text-white/40 space-y-0.5">
              <p>📄 PDF: Max {MAX_PDF_MB} MB</p>
              <p>📊 PPT / PPTX: Max {MAX_PPT_MB} MB</p>
              <p>📝 DOC / DOCX / TXT: Max {MAX_DOC_MB} MB</p>
              <p>🖼️ Image (JPG, PNG): Max {MAX_IMAGE_MB} MB · must contain readable text</p>
              <p>✍️ Pasted text: Max {MAX_TEXT_WORDS.toLocaleString()} words</p>
            </div>

            {/* Text Input */}
            <div>
              <label className="text-sm text-white/60 block mb-2">Paste or type your notes</label>
              <textarea
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Paste lecture notes, textbook excerpts, or any study material here..."
                rows={8}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none text-sm leading-relaxed"
              />
              {textContent.length > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs ${textWords > MAX_TEXT_WORDS ? "text-rose-400" : "text-white/30"}`}>
                    {textWords > MAX_TEXT_WORDS ? `Word limit exceeded (${textWords.toLocaleString()} / ${MAX_TEXT_WORDS.toLocaleString()})` : ""}
                  </span>
                  <span className="text-xs text-white/30">{textWords.toLocaleString()} / {MAX_TEXT_WORDS.toLocaleString()} words</span>
                </div>
              )}
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}

            <button
              onClick={handleNext}
              disabled={!canProceedStep0}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/8 disabled:text-white/30 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 1: Configure */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Configure your questions</h2>
              <p className="text-white/40 text-sm">Set a title and choose how challenging the questions should be</p>
            </div>

            {/* Source Preview */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {file ? <FileIcon type={getFileType(file)} /> : <span className="text-lg">📝</span>}
                  <span>{file ? file.name : "Pasted notes"}</span>
                </div>
                {textContent && (
                  <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? "Hide" : "Preview"}
                  </button>
                )}
              </div>
              {showPreview && (
                <div className="mt-2 max-h-32 overflow-y-auto text-xs text-white/50 leading-relaxed border-t border-white/5 pt-2">
                  {(textContent || extractedContent).slice(0, 600)}...
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-sm text-white/60 block mb-1.5">Material Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Chapter 5 – Cell Biology"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="px-5 py-3 bg-white/8 hover:bg-white/12 rounded-xl text-sm font-semibold transition-colors">
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceedStep1}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-white/8 disabled:text-white/30 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" /> Generate Questions
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Generating */}
        {step === 2 && !done && (
          <div className="text-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Generating Questions...</h2>
              <p className="text-white/40 text-sm">{progressStep}</p>
            </div>
            <div className="max-w-xs mx-auto">
              <div className="bg-white/8 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-violet-500 to-purple-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-white/30 mt-2">{progressPct}%</p>
            </div>
            <p className="text-white/25 text-xs">This may take 20–40 seconds for longer materials</p>
          </div>
        )}

        {/* STEP 2: Done */}
        {step === 2 && done && (
          <div className="text-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Questions Ready!</h2>
              <p className="text-white/60 text-sm">
                Generated <span className="text-white font-bold">{done.count} questions</span> from <span className="text-white font-bold">"{done.title}"</span>
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={resetForm} className="flex items-center gap-2 px-5 py-3 bg-white/8 hover:bg-white/12 rounded-xl text-sm font-semibold transition-colors">
                <RefreshCw className="w-4 h-4" /> Upload More
              </button>
              <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors">
                <BookOpen className="w-4 h-4" /> Play Now
              </Link>
            </div>
          </div>
        )}

        {/* Materials List */}
        {step < 2 && materials.length > 0 && (
          <div className="mt-10">
            <h2 className="font-semibold mb-4 flex items-center gap-2 text-white/80">
              <FileText className="w-4 h-4 text-violet-400" /> Your Materials ({materials.length})
            </h2>
            <div className="space-y-2">
              {materials.map(m => (
                <div key={m.id} className="bg-white/4 border border-white/8 rounded-xl p-4 flex items-center justify-between hover:bg-white/6 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileIcon type={m.file_type} />
                    <div>
                      <p className="font-medium text-sm">{m.title}</p>
                      <p className="text-xs text-white/35 mt-0.5">
                        {m.question_count || 0} questions · {m.file_type?.toUpperCase()} · {new Date(m.created_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deleteMaterial(m.id)} className="p-2 text-white/25 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}