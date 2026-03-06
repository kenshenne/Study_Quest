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

const DIFFICULTY_INFO = {
  easy:   { color: "emerald", label: "Easy",   count: 15, desc: "15 multiple choice questions · Great for first review" },
  medium: { color: "amber",   label: "Medium",  count: 25, desc: "25 questions · Multiple choice + enumeration · Hints included" },
  hard:   { color: "rose",    label: "Hard",    count: 35, desc: "35 questions · All types + fill-in-the-blank · No hints" },
};

function getFileType(file) {
  if (!file) return "text";
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  return "image";
}

function FileIcon({ type }) {
  const icons = { pdf: "📄", pptx: "📊", image: "🖼️", text: "📝" };
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
  const [difficulty, setDifficulty] = useState("medium");

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
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  };

  const removeFile = () => { setFile(null); setExtractedContent(""); };

  const canProceedStep0 = file || textContent.trim().length > 20 || extraImages.length > 0;
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

    try {
      if (file) {
        setProgressStep("Extracting text from file...");
        setProgressPct(15);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setProgressPct(30);
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
        });
        if (result.status === "success" && result.output?.text) {
          content = result.output.text;
          setExtractedContent(content);
        }
        setProgressPct(45);
      } else if (extraImages.length > 0) {
        setProgressStep("Extracting text from images...");
        setProgressPct(15);
        const allTexts = [];
        for (let i = 0; i < extraImages.length; i++) {
          const { file_url } = await base44.integrations.Core.UploadFile({ file: extraImages[i] });
          const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
          });
          if (result.status === "success" && result.output?.text) allTexts.push(result.output.text);
          setProgressPct(15 + Math.round(((i + 1) / extraImages.length) * 25));
        }
        if (allTexts.length > 0) {
          content = allTexts.join("\n\n---\n\n");
          setExtractedContent(content);
        }
        setProgressPct(45);
      }

      setProgressStep("Saving material...");
      setProgressPct(50);
      const material = await base44.entities.StudyMaterial.create({
        user_id: user.email,
        title: title.trim(),
        content,
        file_type: getFileType(file)
      });

      setProgressStep("Analyzing content & generating questions...");
      setProgressPct(60);

      const count = DIFFICULTY_INFO[difficulty].count;
      const difficultyInstructions = {
        easy: `QUESTION TYPES: Multiple choice ONLY (4 options each).
- Test basic recall and recognition of key facts from the material.
- Options: 1 clearly correct answer + 3 plausible but wrong distractors.
- Questions should be straightforward and unambiguous.
- HINT: Give a vague category clue (e.g. "Think about what happens at the start of the process") — never reveal the answer.`,
        medium: `QUESTION TYPES: Mix of multiple choice (4 options) AND enumeration.
- Multiple choice (~60%): Test understanding and application of concepts.
- Enumeration (~40%): Ask students to list steps, components, or examples. Correct answer = comma-separated key terms.
- Questions should require understanding, not just memorization.
- HINT: Give a structural clue (e.g. "There are 3 parts" or "Consider the relationship between X and Y") — do NOT reveal the answer.`,
        hard: `QUESTION TYPES: Mix of multiple choice (4 options), enumeration, AND fill-in-the-blank.
- Multiple choice (~40%): Test deep analysis and nuanced understanding.
- Enumeration (~30%): Require precise recall of lists.
- Fill-in-the-blank (~30%): Remove a key term from a real sentence in the material. Use ___ for the blank. Correct answer = exact missing word/phrase.
- Questions should challenge critical thinking and precise recall.
- NO HINTS — set hint to "".`
      };

      const prompt = `You are an expert educational question generator for a gamified learning app. Create high-quality study questions STRICTLY based on the provided material.

═══════════════════════════════════
STUDY MATERIAL:
═══════════════════════════════════
${content.slice(0, 10000)}
═══════════════════════════════════

TASK: Generate exactly ${count} questions at difficulty: "${difficulty.toUpperCase()}"

${difficultyInstructions[difficulty]}

GLOBAL RULES:
1. Every question must be directly answerable from the material above. NO external knowledge.
2. Cover a WIDE variety of topics — do not repeat the same concept twice.
3. Each question must be unique and test a different piece of knowledge.
4. Explanations: 1-2 sentences explaining WHY the answer is correct, citing the material.
5. multiple_choice: exactly 4 options in the "options" array.
6. enumeration: empty "options" array []. correct_answer = comma-separated key terms.
7. fill_blank: empty "options" array []. question_text must contain ___ for the blank.
8. "topic" = short 2-4 word label (e.g. "Cell Division", "World War II Causes").
9. Never generate trick questions or questions with ambiguous answers.
10. Shuffle the correct answer position in multiple choice options randomly.

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
                  question_type: { type: "string", enum: ["multiple_choice", "enumeration", "fill_blank"] },
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
            difficulty,
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
      setError("Something went wrong. Please try again.");
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

  const diffInfo = DIFFICULTY_INFO[difficulty];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4 sticky top-0 bg-[#0a0a0f]/90 backdrop-blur-sm z-10">
        <Link to={createPageUrl("Dashboard")} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Upload Study Materials</h1>
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
              <input id="fileInput" type="file" accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.txt,.docx" className="hidden"
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
                  <p className="text-xs text-white/30">Supports PDF, PowerPoint, images, text files</p>
                </>
              )}
              {/* Multiple images */}
              {!file && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <label className="text-xs text-white/40 block mb-2">Or upload multiple images</label>
                  <input id="multiImgInput" type="file" accept=".png,.jpg,.jpeg,.gif,.webp" multiple className="hidden"
                    onChange={e => setExtraImages(Array.from(e.target.files))} />
                  <button type="button" onClick={e => { e.stopPropagation(); document.getElementById("multiImgInput").click(); }}
                    className="px-3 py-1.5 bg-white/8 hover:bg-white/12 rounded-lg text-xs text-white/60 transition-colors">
                    Select multiple images
                  </button>
                  {extraImages.length > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">{extraImages.length} image(s) selected</p>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-xs text-white/30 font-medium">OR</span>
              <div className="flex-1 h-px bg-white/8" />
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
                <p className="text-xs text-white/30 mt-1 text-right">{textContent.length} characters</p>
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

            {/* Difficulty */}
            <div>
              <label className="text-sm text-white/60 block mb-2">Question Difficulty</label>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(DIFFICULTY_INFO).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setDifficulty(key)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      difficulty === key
                        ? key === "easy"   ? "bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/30"
                          : key === "medium" ? "bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/30"
                          :                   "bg-rose-500/15 border-rose-500 ring-1 ring-rose-500/30"
                        : "bg-white/3 border-white/8 hover:bg-white/6 hover:border-white/15"
                    }`}
                  >
                    <div className={`font-bold text-sm mb-1 ${difficulty === key ? (key === "easy" ? "text-emerald-400" : key === "medium" ? "text-amber-400" : "text-rose-400") : "text-white/60"}`}>
                      {info.label}
                    </div>
                    <div className="text-xs text-white/35 leading-snug">{info.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <Zap className="w-4 h-4 text-violet-400 shrink-0" />
              <p className="text-sm text-white/60">
                Will generate <span className="text-white font-semibold">{DIFFICULTY_INFO[difficulty].count} {difficulty}</span> questions from your material
              </p>
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
                <Zap className="w-4 h-4" /> Generate {DIFFICULTY_INFO[difficulty].count} Questions
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