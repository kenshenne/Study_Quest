import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { Zap, Upload, Trophy, User, BookOpen, Swords, Bomb, Layers, MessageCircle, Star, FileText } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";
import InviteNotification from "@/components/game/InviteNotification";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const [profiles, sessions, achs] = await Promise.all([
        base44.entities.UserProfile.filter({ user_id: u.email }),
        base44.entities.GameSession.filter({ user_id: u.email }, "-created_date", 5),
        base44.entities.Achievement.filter({ user_id: u.email })
      ]);

      let p;
      let isNewUser = false;
      if (profiles.length > 0) {
        p = profiles[0];
        // Increment login count for returning users
        const newCount = (p.login_count || 0) + 1;
        p = await base44.entities.UserProfile.update(p.id, { login_count: newCount });
      } else {
        isNewUser = true;
        p = await base44.entities.UserProfile.create({
          user_id: u.email,
          username: u.full_name || u.email.split("@")[0],
          avatar: "🎓", xp: 0, level: 1, accuracy_rate: 0,
          total_questions_answered: 0, total_correct: 0, badges: [], friends: [],
          login_count: 1
        });
      }
      setProfile({ ...p, _isNewUser: isNewUser });
      setIsNewUser(isNewUser);
      setRecentSessions(sessions);
      setAchievements(achs);

      // Count unread messages
      const msgs = await base44.entities.ChatMessage.filter({ to_user_id: u.email, read: false });
      setUnreadMessages(msgs.length);
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
    { id: "maze", name: "Maze Quiz", icon: <Swords className="w-7 h-7" />, desc: "Navigate a maze and answer questions at checkpoints", color: "from-violet-600 to-purple-700", glow: "shadow-violet-500/30", page: "MazeGame" },
    { id: "bomb", name: "Bomb Grid", icon: <Bomb className="w-7 h-7" />, desc: "Minesweeper-style: bombs trigger study questions", color: "from-rose-600 to-red-700", glow: "shadow-rose-500/30", page: "BombGame" },
    { id: "blast", name: "Tetriquiz", icon: <Layers className="w-7 h-7" />, desc: "Clear Tetris lines and answer quiz questions to continue", color: "from-emerald-600 to-teal-700", glow: "shadow-emerald-500/30", page: "BlastGame" }
  ];

  const xpToNextLevel = (profile?.level || 1) * 200;
  const currentXP = (profile?.xp || 0) % xpToNextLevel;
  const xpPercent = Math.min((currentXP / xpToNextLevel) * 100, 100);
  const gameLabels = { maze: "Maze Quiz", bomb: "Bomb Grid", blast: "Tetriquiz" };

  const navLinks = [
    { to: "Upload", icon: <Upload className="w-4 h-4" />, label: "Materials" },
    { to: "Leaderboard", icon: <Trophy className="w-4 h-4" />, label: "Leaderboard" },
    { to: "Chat", icon: <MessageCircle className="w-4 h-4" />, label: "Chat", badge: unreadMessages },
    { to: "Profile", icon: <User className="w-4 h-4" />, label: "Profile" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/5 px-4 md:px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-black/20 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <MobileNav unreadMessages={unreadMessages} profile={profile} />
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Study Quest</span>
          </div>
        </div>

      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Welcome + XP */}
        <div className="mb-10">
          <div className="flex items-center gap-3 md:gap-4 mb-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 flex items-center justify-center text-2xl md:text-3xl shrink-0">
              {profile?.avatar || "🎓"}
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold">Welcome back, {profile?.username || "Scholar"}!</h1>
              <p className="text-white/50 mt-1 text-sm">Level {profile?.level || 1} · {profile?.xp || 0} XP total</p>
            </div>
          </div>
          <div className="bg-white/5 rounded-full h-2 w-full max-w-sm">
            <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all" style={{ width: `${xpPercent}%` }} />
          </div>
          <p className="text-xs text-white/30 mt-1">{currentXP} / {xpToNextLevel} XP to Level {(profile?.level || 1) + 1}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-10">
          {[
            { label: "Questions Answered", value: profile?.total_questions_answered || 0, icon: "📝" },
            { label: "Accuracy Rate", value: `${Math.round(profile?.accuracy_rate || 0)}%`, icon: "🎯" },
            { label: "Achievements", value: achievements.length, icon: "🏆" }
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Game Modes */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" /> Games
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {/* Recent Games */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" /> Recent Games
            </h3>
            {recentSessions.length === 0 ? (
              <p className="text-white/30 text-sm">No games played yet. Pick a game above!</p>
            ) : (
              <div className="space-y-2">
                {recentSessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-t border-white/5 first:border-0">
                    <div>
                      <p className="text-sm font-medium">{gameLabels[s.game_type]}</p>
                      <p className="text-xs text-white/40">
                        {s.correct_answers}/{s.total_questions} correct · {s.difficulty}
                        {!s.completed && <span className="ml-1 text-amber-400">· incomplete</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-violet-400">+{s.xp_earned} XP</p>
                      <p className="text-xs text-white/30">{new Date(s.created_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" /> Achievements
            </h3>
            {achievements.length === 0 ? (
              <p className="text-white/30 text-sm">Play games to unlock achievements!</p>
            ) : (
              <div className="space-y-2">
                {achievements.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-t border-white/5 first:border-0">
                    <span className="text-xl">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-white/40">{a.description}</p>
                    </div>
                    <span className="text-xs text-yellow-400 font-semibold shrink-0">+{a.xp_reward} XP</span>
                  </div>
                ))}
                {achievements.length > 5 && <p className="text-xs text-white/30 text-center pt-1">+{achievements.length - 5} more on Profile</p>}
              </div>
            )}
          </div>
        </div>

        {/* Invite Notification — listens for incoming game invites */}
        {user && (
          <InviteNotification
            userId={user.email}
            onAccepted={(session) => navigate(createPageUrl("MazeGame") + `?join=${session.id}`)}
          />
        )}

        {/* Upload CTA */}
        <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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