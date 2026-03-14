import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Trophy, Users, Globe, Crown } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";

export default function Leaderboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [filter, setFilter] = useState("global");
  const [gameFilter, setGameFilter] = useState("all");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    init();
    // Poll every 15s and also subscribe to real-time changes
    const interval = setInterval(loadData, 15000);
    const unsubProfile = base44.entities.UserProfile.subscribe(() => loadData());
    const unsubSession = base44.entities.GameSession.subscribe(() => loadData());
    return () => { clearInterval(interval); unsubProfile(); unsubSession(); };
  }, []);

  const init = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const profiles = await base44.entities.UserProfile.filter({ user_id: u.email });
      if (profiles.length > 0) setProfile(profiles[0]);
      await loadData();
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Leaderboard"));
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    const [allP, allS, onlineStatuses] = await Promise.all([
      base44.entities.UserProfile.list("-xp", 50),
      base44.entities.GameSession.list("-created_date", 200),
      base44.entities.OnlineStatus.filter({ is_online: true })
    ]);
    setAllProfiles(allP);
    setSessions(allS);
    // Active = users with is_online=true and last_seen within 3 mins
    const now = Date.now();
    const active = onlineStatuses.filter(s => {
      return now - new Date(s.last_seen).getTime() < 3 * 60 * 1000;
    });
    setActiveCount(active.length);
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white animate-pulse">Loading...</div>;

  const friends = profile?.friends || [];

  const filteredProfiles = allProfiles.filter(p => {
    if (filter === "friends") return friends.includes(p.user_id) || p.user_id === user?.email;
    return true;
  });

  const getScore = (p) => {
    const userSessions = sessions.filter(s => s.user_id === p.user_id && (gameFilter === "all" || s.game_type === gameFilter));
    const total = userSessions.reduce((acc, s) => acc + (s.score || 0), 0);
    return total || p.xp || 0;
  };

  const ranked = [...filteredProfiles]
    .map(p => ({ ...p, displayScore: getScore(p) }))
    .sort((a, b) => b.displayScore - a.displayScore);

  const myRank = ranked.findIndex(p => p.user_id === user?.email) + 1;

  const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];
  const rankBgs = ["bg-yellow-400/10 border-yellow-400/30", "bg-slate-300/10 border-slate-300/30", "bg-amber-600/10 border-amber-600/30"];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3 sticky top-0 bg-[#0a0a0f] z-10">
        <MobileNav profile={null} />
        <h1 className="text-lg font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> Leaderboard</h1>
        <div className="ml-auto flex items-center gap-2 text-xs text-white/40">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
          {activeCount} active
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="flex bg-white/5 rounded-xl p-1 gap-1">
            {[
              { id: "global", label: "Global", icon: <Globe className="w-3.5 h-3.5" /> },
              { id: "friends", label: "Friends", icon: <Users className="w-3.5 h-3.5" /> }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f.id ? "bg-violet-600 text-white" : "text-white/40 hover:text-white"}`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
          <div className="flex bg-white/5 rounded-xl p-1 gap-1">
            {[
              { id: "all", label: "All" },
              { id: "maze", label: "Maze" },
              { id: "bomb", label: "Bomb" },
              { id: "blast", label: "Tetriquiz" }
            ].map(g => (
              <button
                key={g.id}
                onClick={() => setGameFilter(g.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${gameFilter === g.id ? "bg-violet-600 text-white" : "text-white/40 hover:text-white"}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* My Rank */}
        {myRank > 0 && (
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-violet-400">#{myRank}</span>
              <div>
                <p className="font-medium">Your Rank</p>
                <p className="text-xs text-white/40">{profile?.username}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">{ranked.find(p => p.user_id === user?.email)?.displayScore || 0}</p>
              <p className="text-xs text-white/40">score</p>
            </div>
          </div>
        )}

        {/* Top 3 */}
        {ranked.length >= 3 && (
          <div className="flex items-end justify-center gap-4 mb-6">
            {[ranked[1], ranked[0], ranked[2]].map((p, i) => {
              const actualRank = i === 1 ? 1 : i === 0 ? 2 : 3;
              const heights = ["h-20", "h-28", "h-16"];
              const textSize = i === 1 ? "text-lg" : "text-base";
              return (
                <div key={p.id} className={`flex flex-col items-center ${i === 1 ? "scale-110" : ""}`}>
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-white/10 mb-1 mx-auto">
                    {p.avatar?.startsWith("http")
                      ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-2xl">{p.avatar || "🎓"}</span>}
                  </div>
                  <div className="text-xs font-medium mb-1 max-w-[80px] truncate">{p.username}</div>
                  <div className={`${heights[i]} w-20 ${rankBgs[actualRank - 1]} border rounded-t-xl flex flex-col items-center justify-center`}>
                    <Crown className={`w-4 h-4 mb-1 ${rankColors[actualRank - 1]}`} />
                    <span className={`font-bold ${rankColors[actualRank - 1]} ${textSize}`}>#{actualRank}</span>
                    <span className="text-xs text-white/60">{p.displayScore}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full Rankings */}
        <div className="space-y-2">
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${p.user_id === user?.email ? "bg-violet-500/10 border-violet-500/30" : "bg-white/3 border-white/8 hover:bg-white/5"}`}
            >
              <span className={`w-8 text-center font-bold text-sm ${i < 3 ? rankColors[i] : "text-white/40"}`}>
                #{i + 1}
              </span>
              <span className="text-xl w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-white/10 shrink-0">
                {p.avatar?.startsWith("http")
                  ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                  : (p.avatar || "🎓")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.username}</p>
                <p className="text-xs text-white/40">Lv.{p.level} · {p.total_questions_answered || 0} questions</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm">{p.displayScore}</p>
                <p className="text-xs text-white/40">{Math.round(p.accuracy_rate || 0)}% acc</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}