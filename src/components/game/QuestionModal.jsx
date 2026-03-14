import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, XCircle, X, Lightbulb, Loader2 } from "lucide-react";

export default function QuestionModal({ question, onAnswer, onClose, showHint = false, doubleXP = false }) {
  const [selected, setSelected] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [validating, setValidating] = useState(false);

  const shuffledOptions = useMemo(() => {
    if (!question?.options?.length) return question?.options || [];
    return [...question.options].sort(() => Math.random() - 0.5);
  }, [question?.question_text]);

  if (!question) return null;

  const handleSubmit = async () => {
    const answer = question.question_type === "multiple_choice" ? selected : textAnswer.trim();
    if (!answer) return;

    setValidating(true);
    let correct = false;

    if (question.question_type === "multiple_choice") {
      correct = answer.toLowerCase() === question.correct_answer.toLowerCase() || answer === question.correct_answer;
    } else {
      // Use LLM for semantic validation of fill_blank and enumeration
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          model: "gemini_3_pro",
          prompt: `You are a quiz answer validator for a student learning app. Be lenient and educational.

Question: "${question.question_text}"
Correct answer: "${question.correct_answer}"
Student's answer: "${answer}"

Rules for acceptance:
- Ignore case differences (uppercase/lowercase don't matter)
- Allow minor spelling variations and typos
- Accept synonyms with the same meaning
- For enumeration questions: all key concepts must be present, order doesn't matter, partial matches per item are OK
- Accept if the core idea/keyword/concept is correctly conveyed
- Do NOT penalize for extra words or slightly different phrasing

Is the student's answer correct?`,
          response_json_schema: {
            type: "object",
            properties: { is_correct: { type: "boolean" } },
            required: ["is_correct"]
          }
        });
        correct = result.is_correct;
      } catch {
        // Fallback: case-insensitive comparison
        const norm = (s) => s.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
        correct = norm(answer) === norm(question.correct_answer);
      }
    }

    setValidating(false);
    setIsCorrect(correct);
    setSubmitted(true);
    if (!correct) setShowExplanation(true);
  };

  const handleContinue = () => {
    onAnswer(isCorrect);
  };

  const difficultyColor = {
    easy: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    medium: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    hard: "text-rose-400 border-rose-500/30 bg-rose-500/10"
  }[question.difficulty] || "text-violet-400 border-violet-500/30 bg-violet-500/10";

  const typeLabel = {
    multiple_choice: "Multiple Choice",
    enumeration: "Enumeration",
    fill_blank: "Fill in the Blank",
    identification: "Identification"
  }[question.question_type] || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onKeyDown={e => e.stopPropagation()}>
      <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-lg border ${difficultyColor} capitalize`}>{question.difficulty}</span>
            <span className="text-xs text-white/30">{typeLabel}</span>
            {doubleXP && <span className="text-xs px-2 py-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">2× XP</span>}
          </div>
          {submitted && (
            <button onClick={onClose} className="text-white/30 hover:text-white/80 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-white font-medium leading-relaxed">{question.question_text}</p>

          {/* Hint */}
          {showHint && question.hint && !submitted && (
            <div>
              {!hintVisible ? (
                <button onClick={() => setHintVisible(true)} className="flex items-center gap-1.5 text-xs text-amber-400/60 hover:text-amber-400 transition-colors">
                  <Lightbulb className="w-3.5 h-3.5" /> Show hint
                </button>
              ) : (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-300">{question.hint}</p>
                </div>
              )}
            </div>
          )}

          {/* Answer Input */}
          {!submitted && (
            <>
              {question.question_type === "multiple_choice" && shuffledOptions?.length > 0 ? (
                <div className="space-y-2">
                  {shuffledOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelected(opt)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${selected === opt ? "bg-violet-500/20 border-violet-500 text-white" : "bg-white/3 border-white/10 text-white/70 hover:bg-white/8 hover:border-white/20"}`}
                    >
                      <span className="text-white/30 mr-2">{String.fromCharCode(65 + i)}.</span> {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={textAnswer}
                  onChange={e => setTextAnswer(e.target.value)}
                  placeholder={question.question_type === "enumeration" ? "List each item (comma or newline separated)..." : "Type your answer..."}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-violet-500 resize-none text-sm"
                />
              )}
              <button
                onClick={handleSubmit}
                disabled={validating || (question.question_type === "multiple_choice" ? !selected : !textAnswer.trim())}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {validating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking answer...
                  </>
                ) : "Submit Answer"}
              </button>
            </>
          )}

          {/* Result */}
          {submitted && (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-4 rounded-xl ${isCorrect ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-rose-500/10 border border-rose-500/30"}`}>
                {isCorrect
                  ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                <div>
                  <p className={`font-semibold text-sm ${isCorrect ? "text-emerald-400" : "text-rose-400"}`}>
                    {isCorrect ? (doubleXP ? "Correct! Double XP earned!" : "Correct! Well done!") : "Incorrect"}
                  </p>
                  {!isCorrect && (
                    <p className="text-xs text-white/60 mt-0.5">
                      Correct: <span className="text-white">{question.correct_answer}</span>
                    </p>
                  )}
                </div>
              </div>

              {showExplanation && question.explanation && (
                <div className="relative bg-white/5 border border-white/10 rounded-xl p-4">
                  <button onClick={() => setShowExplanation(false)} className="absolute top-2 right-2 text-white/30 hover:text-white/70 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-white/60 font-semibold mb-1">Explanation</p>
                  <p className="text-sm text-white/80 leading-relaxed pr-6">{question.explanation}</p>
                </div>
              )}

              <button onClick={handleContinue} className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold text-sm transition-colors">
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}