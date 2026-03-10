import { Trophy, RotateCcw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { useState } from "react";

export default function GameOverModal({ stats, onRestart, gameType }) {
  const [showReview, setShowReview] = useState(false);
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const gameLabels = { maze: "Maze Quiz", bomb: "Bomb Grid", blast: "Block Blast" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl text-white">
        <div className="p-6 text-center border-b border-white/5">
          <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-2xl font-bold mb-1">Game Over!</h2>
          <p className="text-white/40 text-sm">{gameLabels[gameType] || "Game"} Complete</p>
        </div>

        <div className="p-6 grid grid-cols-3 gap-3 text-center border-b border-white/5">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-2xl font-bold text-emerald-400">{stats.correct}</div>
            <div className="text-xs text-white/40 mt-1">Correct</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-2xl font-bold text-rose-400">{stats.incorrect}</div>
            <div className="text-xs text-white/40 mt-1">Incorrect</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-2xl font-bold text-violet-400">{accuracy}%</div>
            <div className="text-xs text-white/40 mt-1">Accuracy</div>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-white/5 text-center">
          <p className="text-sm text-white/60">
            <span className="text-white font-semibold">{stats.correct} correct</span> out of <span className="text-white font-semibold">{stats.total} questions</span>
          </p>
          <p className="text-violet-400 font-bold text-lg mt-1">+{stats.xp} XP earned</p>
        </div>

        {/* Mistakes Review */}
        {stats.mistakes?.length > 0 && (
          <div className="px-6 py-3 border-b border-white/5">
            <button
              onClick={() => setShowReview(!showReview)}
              className="w-full flex items-center justify-between text-sm text-white/60 hover:text-white transition-colors"
            >
              <span>Review {stats.mistakes.length} mistake{stats.mistakes.length !== 1 ? "s" : ""}</span>
              {showReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showReview && (
              <div className="mt-3 space-y-3 max-h-48 overflow-y-auto">
                {stats.mistakes.map((m, i) => (
                  <div key={i} className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                    <p className="text-xs text-white/80 font-medium mb-1">{m.question}</p>
                    <p className="text-xs text-rose-400">Your answer: {m.yourAnswer}</p>
                    <p className="text-xs text-emerald-400">Correct: {m.correct}</p>
                    {m.explanation && <p className="text-xs text-white/40 mt-1">{m.explanation}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-5 flex gap-3">
          <button onClick={onRestart} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-semibold transition-colors">
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
          <Link to={createPageUrl("Dashboard")} className="flex-1 flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors">
            <Home className="w-4 h-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}