import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { Zap, Upload, Trophy, User, BookOpen, Swords, Bomb, Layers } from "lucide-react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const profiles = await base44.entities.UserProfile.filter({ user_id: u.email });
      if (profiles.length > 0) {
        setProfile(profiles[0]);
      } else {
        const newProfile = await base44.entities.UserProfile.create({
          user_id: u.email,
          username: u.full_name || u.email.split("@")[0],
          avatar: "🎓",
          xp: 0,
          level: 1,
          accuracy_rate: 0,
          total_questions_answered: 0,
          total_correct: 0,
          badges: [],
          friends: []
        });
        setProfile(newProfile);
      }
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Dashboard"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading Study Quest...</div>
      </div>
    );
  }

  const games = [
    {
      id: "maze",
      name: "Maze Quiz",
      icon: <Swords className="w-8 h-8" />,
      desc: "Navigate through a maze and answer questions at checkpoints",
      color: "from-violet-600 to-purple-700",
      glow: "shadow-violet-500/30",
      page: "MazeGame"
    },
    {
      id: "bomb",
      name: "Bomb Grid",
      icon: <Bomb className="w-8 h-8" />,
      desc: "Minesweeper-style grid where bombs trigger study questions",
      color: "from-rose-600 to-red-700",
      glow: "shadow-rose-500/30",
      page: "BombGame"
    },
    {
      id: "blast",
      name: "Block Blast",
      icon: <Layers className="w-8 h-8" />,
      desc: "Place blocks to clear lines and answer questions to continue",
      color: "from-emerald-600 to-teal-700",
      glow: "shadow-emerald-500/30",
      page: "BlastGame"
    }
  ];

  const xpToNextLevel = (profile?.level || 1) * 200;
  const currentXP = (profile?.xp || 0) % xpToNextLevel;
  const xpPercent = Math.min((currentXP / xpToNextLevel) * 100, 100);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-black/20 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Study Quest</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to={createPageUrl("Upload")} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload
          </Link>
          <Link to={createPageUrl("Leaderboard")} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Leaderboard
          </Link>
          <Link to={createPageUrl("Profile")} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 flex items-center justify-center text-3xl">
              {profile?.avatar || "🎓"}
            </div>
            <div>
              <h1 className="text-3xl font-bold">Welcome back, {profile?.username || "Scholar"}!</h1>
              <p className="text-white/50 mt-1">Level {profile?.level || 1} · {profile?.xp || 0} XP total</p>
            </div>
          </div>
          {/* XP Bar */}
          <div className="bg-white/5 rounded-full h-2 w-full max-w-sm">
            <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all" style={{ width: `${xpPercent}%` }} />
          </div>
          <p className="text-xs text-white/30 mt-1">{currentXP} / {xpToNextLevel} XP to Level {(profile?.level || 1) + 1}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "Questions Answered", value: profile?.total_questions_answered || 0, icon: "📝" },
            { label: "Accuracy Rate", value: `${Math.round(profile?.accuracy_rate || 0)}%`, icon: "🎯" },
            { label: "Total XP", value: profile?.xp || 0, icon: "⚡" }
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Game Modes */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" /> Choose Your Game Mode
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {games.map((game) => (
              <Link key={game.id} to={createPageUrl(game.page)}>
                <div className={`group relative bg-gradient-to-br ${game.color} p-[1px] rounded-2xl shadow-xl ${game.glow} hover:scale-[1.02] transition-all duration-200 cursor-pointer`}>
                  <div className="bg-[#0f0f17] rounded-2xl p-6 h-full">
                    <div className="mb-4 opacity-90">{game.icon}</div>
                    <h3 className="font-bold text-lg mb-2">{game.name}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{game.desc}</p>
                    <div className={`mt-4 text-xs font-semibold bg-gradient-to-r ${game.color} bg-clip-text text-transparent`}>
                      Play Now →
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Upload CTA */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold mb-1">Upload Study Materials</h3>
            <p className="text-white/40 text-sm">Upload PDFs, slides, or notes to generate questions automatically</p>
          </div>
          <Link to={createPageUrl("Upload")} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors">
            Upload →
          </Link>
        </div>
      </main>
    </div>
  );
}