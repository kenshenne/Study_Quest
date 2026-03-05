import { useState, useEffect } from "react";
import { Star } from "lucide-react";

export default function AchievementToast({ achievement, onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 400); }, 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-400 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="bg-[#1a1a2e] border border-yellow-500/40 rounded-2xl p-4 flex items-center gap-3 shadow-2xl min-w-[280px]">
        <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-2xl shrink-0">
          {achievement.icon}
        </div>
        <div>
          <p className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
            <Star className="w-3 h-3" /> Achievement Unlocked!
          </p>
          <p className="font-bold text-white text-sm">{achievement.title}</p>
          <p className="text-xs text-white/50">{achievement.description} · +{achievement.xp_reward} XP</p>
        </div>
      </div>
    </div>
  );
}