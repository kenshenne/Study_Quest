import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";

export default function MaterialSelector({ userId, onSelect, difficulty, onDifficultyChange }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (userId) {
      base44.entities.StudyMaterial.filter({ user_id: userId }).then(m => {
        setMaterials(m);
        setLoading(false);
      });
    }
  }, [userId]);

  if (loading) return <div className="text-white/40 text-sm animate-pulse">Loading materials...</div>;

  if (materials.length === 0) {
    return (
      <div className="text-center py-8">
        <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <p className="text-white/40 mb-4">No study materials uploaded yet.</p>
        <Link to={createPageUrl("Upload")} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors">
          Upload Materials
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-white/60 mb-2">Select Study Material</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {materials.map(m => (
            <button
              key={m.id}
              onClick={() => { setSelected(m.id); }}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${selected === m.id ? "bg-violet-500/20 border-violet-500" : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"}`}
            >
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-white/40 mt-0.5">{m.question_count || 0} questions</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm text-white/60 mb-2">Difficulty</p>
        <div className="flex gap-2">
          {["easy", "medium", "hard"].map(d => (
            <button
              key={d}
              onClick={() => onDifficultyChange(d)}
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

      <button
        onClick={() => selected && onSelect(selected)}
        disabled={!selected}
        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
      >
        Start Game <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}