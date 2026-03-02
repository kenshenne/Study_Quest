import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { Upload as UploadIcon, FileText, ArrowLeft, CheckCircle, Loader2, Trash2 } from "lucide-react";

export default function Upload() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const mats = await base44.entities.StudyMaterial.filter({ user_id: u.email });
      setMaterials(mats);
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Upload"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Please enter a title."); return; }
    if (!textContent.trim() && !file) { setError("Please provide content or upload a file."); return; }
    setError("");
    setUploading(true);

    let content = textContent;

    try {
      if (file) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
        });
        if (result.status === "success") content = result.output?.text || textContent;
      }

      const material = await base44.entities.StudyMaterial.create({
        user_id: user.email,
        title,
        content,
        file_type: file ? (file.name.endsWith(".pdf") ? "pdf" : file.name.endsWith(".pptx") ? "pptx" : "image") : "text"
      });

      setUploading(false);
      setGenerating(true);

      const qCounts = { easy: 15, medium: 25, hard: 35 };
      const count = qCounts[difficulty];

      const difficultyInstructions = {
        easy: `
QUESTION TYPES: Multiple choice ONLY (4 options each).
- Test basic recall and recognition of key facts.
- Options must include 1 clearly correct answer and 3 plausible but wrong distractors.
- Questions should be straightforward and unambiguous.
- HINT: Give a vague category clue (e.g. "Think about what happens at the start of the process") — never reveal the answer.`,

        medium: `
QUESTION TYPES: Mix of multiple choice (4 options) AND enumeration (list answers).
- Multiple choice: Test understanding and application of concepts.
- Enumeration: Ask students to list steps, components, or examples (e.g. "List 3 causes of..."). Correct answer = comma-separated list of key terms.
- Questions should require understanding, not just memorization.
- HINT: Give a structural clue (e.g. "There are 3 parts to this answer" or "Consider the relationship between X and Y") — do NOT give away the answer.`,

        hard: `
QUESTION TYPES: Mix of multiple choice (4 options), enumeration, AND fill-in-the-blank.
- Multiple choice: Test deep analysis and nuanced understanding.
- Enumeration: Require precise recall of ordered or unordered lists.
- Fill-in-the-blank: Remove a key term or phrase from a sentence from the material (e.g. "The process of ___ converts glucose into ATP."). Correct answer = exact missing word/phrase.
- Questions should challenge critical thinking and precise recall.
- NO HINTS for hard difficulty — set hint to an empty string "".`
      };

      const prompt = `You are an expert educational question generator for a gamified learning app. Your job is to create high-quality study questions STRICTLY based on the provided material.

═══════════════════════════════════
STUDY MATERIAL (use ONLY this content):
═══════════════════════════════════
${content.slice(0, 10000)}
═══════════════════════════════════

TASK: Generate exactly ${count} questions at difficulty level: "${difficulty.toUpperCase()}"

${difficultyInstructions[difficulty]}

GLOBAL RULES (apply to ALL questions):
1. Every question must be directly answerable from the study material above. NO external knowledge.
2. Cover a WIDE variety of topics from the material — do not repeat the same concept.
3. Each question must be unique and test a different piece of knowledge.
4. Explanations must be 1-2 sentences that clearly explain WHY the answer is correct, referencing the material.
5. For multiple_choice: always provide exactly 4 options in the "options" array.
6. For enumeration: provide an empty "options" array []. Correct answer = key terms separated by commas.
7. For fill_blank: provide an empty "options" array []. The question_text must contain a blank indicated by ___.
8. The "topic" field = a short 2-4 word label for the concept being tested (e.g. "Cell Division", "French Revolution Causes").
9. Vary question difficulty within the set — some easier, some harder, but all at the "${difficulty}" tier.
10. Never generate trick questions or questions with ambiguous answers.

Generate exactly ${count} questions now.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question_text: { type: "string" },
                  question_type: { type: "string", enum: ["multiple_choice", "enumeration", "fill_blank"] },
                  options: { type: "array", items: { type: "string" } },
                  correct_answer: { type: "string" },
                  explanation: { type: "string" },
                  topic: { type: "string" },
                  hint: { type: "string" }
                },
                required: ["question_text", "question_type", "correct_answer", "explanation", "topic"]
              }
            }
          },
          required: ["questions"]
        }
      });

      const questions = response.questions || [];
      if (questions.length > 0) {
        await base44.entities.Question.bulkCreate(
          questions.map(q => ({
            ...q,
            material_id: material.id,
            user_id: user.email,
            difficulty,
            options: q.options || []
          }))
        );
        await base44.entities.StudyMaterial.update(material.id, { question_count: questions.length });
      }

      setSuccess(`Generated ${questions.length} questions from "${title}"!`);
      setTitle(""); setTextContent(""); setFile(null);
      const mats = await base44.entities.StudyMaterial.filter({ user_id: user.email });
      setMaterials(mats);
    } catch (e) {
      setError("Failed to process material. Please try again.");
    } finally {
      setUploading(false);
      setGenerating(false);
    }
  };

  const deleteMaterial = async (id) => {
    await base44.entities.StudyMaterial.delete(id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white animate-pulse">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <Link to={createPageUrl("Dashboard")} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Upload Study Materials</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
          <h2 className="font-semibold mb-4">Add New Material</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/60 block mb-1">Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Chapter 5 - Cell Biology"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-sm text-white/60 block mb-1">Upload File (PDF, PPTX, Image)</label>
              <div
                onClick={() => document.getElementById("fileInput").click()}
                className="border-2 border-dashed border-white/10 hover:border-violet-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <UploadIcon className="w-8 h-8 mx-auto mb-2 text-white/30" />
                <p className="text-white/40 text-sm">{file ? file.name : "Click to upload or drag and drop"}</p>
                <input id="fileInput" type="file" accept=".pdf,.pptx,.png,.jpg,.jpeg" className="hidden" onChange={e => setFile(e.target.files[0])} />
              </div>
            </div>

            <div>
              <label className="text-sm text-white/60 block mb-1">Or Paste / Type Notes</label>
              <textarea
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Paste your study notes here..."
                rows={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="text-sm text-white/60 block mb-2">Question Difficulty</label>
              <div className="flex gap-3">
                {["easy", "medium", "hard"].map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border capitalize transition-all ${
                      difficulty === d
                        ? d === "easy" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                          : d === "medium" ? "bg-amber-500/20 border-amber-500 text-amber-400"
                          : "bg-rose-500/20 border-rose-500 text-rose-400"
                        : "border-white/10 text-white/40 hover:border-white/20"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}
            {success && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4" /> {success}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={uploading || generating}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {uploading && <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>}
              {generating && <><Loader2 className="w-4 h-4 animate-spin" /> Generating Questions...</>}
              {!uploading && !generating && "Generate Questions"}
            </button>
          </div>
        </div>

        {/* Materials List */}
        {materials.length > 0 && (
          <div>
            <h2 className="font-semibold mb-4">Your Materials</h2>
            <div className="space-y-3">
              {materials.map(m => (
                <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-violet-400" />
                    <div>
                      <p className="font-medium text-sm">{m.title}</p>
                      <p className="text-xs text-white/40">{m.question_count || 0} questions · {m.file_type}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteMaterial(m.id)} className="text-white/30 hover:text-rose-400 transition-colors">
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