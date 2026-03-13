import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { UserPlus, Search, Check, X, LogOut, ChevronDown, ChevronUp, Star, MessageCircle, Camera, Upload } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";

const AVATARS = ["🎓", "🦁", "🐯", "🦊", "🐼", "🐸", "🦄", "🐉", "🤖", "👾", "🎮", "⚡", "🔥", "💎", "🌟"];

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("🎓");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const profiles = await base44.entities.UserProfile.filter({ user_id: u.email });
      if (profiles.length > 0) {
        const p = profiles[0];
        setProfile(p);
        setUsername(p.username || "");
        setSelectedAvatar(p.avatar || "🎓");
        loadFriends(p);
        loadPendingRequests(p);
      }
      const [s, achs] = await Promise.all([
        base44.entities.GameSession.filter({ user_id: u.email }, "-created_date", 30),
        base44.entities.Achievement.filter({ user_id: u.email })
      ]);
      setSessions(s);
      setAchievements(achs);
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Profile"));
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async (p) => {
    if (!p.friends?.length) return;
    const all = await Promise.all(p.friends.map(fid => base44.entities.UserProfile.filter({ user_id: fid })));
    setFriendProfiles(all.flat());
  };

  const loadPendingRequests = async (p) => {
    if (!p.friend_requests_received?.length) return;
    const all = await Promise.all(p.friend_requests_received.map(fid => base44.entities.UserProfile.filter({ user_id: fid })));
    setPendingRequests(all.flat());
  };

  const saveProfile = async () => {
    if (!username.trim()) return;
    setSaving(true);
    const updated = await base44.entities.UserProfile.update(profile.id, {
      username: username.trim(),
      avatar: selectedAvatar
    });
    setProfile(updated);
    setEditing(false);
    setSaving(false);
  };

  const searchFriends = async () => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim();
    // Fetch a broader list and filter client-side for case-insensitive matching
    const allProfiles = await base44.entities.UserProfile.list("-created_date", 200);
    const lq = q.toLowerCase();
    const combined = allProfiles.filter(p =>
      p.user_id !== user.email &&
      (p.username?.toLowerCase().includes(lq) || p.user_id?.toLowerCase().includes(lq))
    );
    setSearchResults(combined);
  };

  const sendFriendRequest = async (targetProfile) => {
    // Update target's received requests
    const targetReceived = targetProfile.friend_requests_received || [];
    if (!targetReceived.includes(user.email)) {
      await base44.entities.UserProfile.update(targetProfile.id, {
        friend_requests_received: [...targetReceived, user.email]
      });
    }
    // Update own sent requests
    const mySent = profile.friend_requests_sent || [];
    const updated = await base44.entities.UserProfile.update(profile.id, {
      friend_requests_sent: [...mySent, targetProfile.user_id]
    });
    setProfile(updated);
    setSearchResults([]);
    setSearchQuery("");
  };

  const acceptRequest = async (requesterProfile) => {
    const myFriends = profile.friends || [];
    const myReceived = profile.friend_requests_received || [];
    const updatedMe = await base44.entities.UserProfile.update(profile.id, {
      friends: [...myFriends, requesterProfile.user_id],
      friend_requests_received: myReceived.filter(x => x !== requesterProfile.user_id)
    });
    setProfile(updatedMe);

    // Update requester too
    const theirFriends = requesterProfile.friends || [];
    const theirSent = requesterProfile.friend_requests_sent || [];
    await base44.entities.UserProfile.update(requesterProfile.id, {
      friends: [...theirFriends, user.email],
      friend_requests_sent: theirSent.filter(x => x !== user.email)
    });

    setPendingRequests(prev => prev.filter(p => p.id !== requesterProfile.id));
    setFriendProfiles(prev => [...prev, requesterProfile]);
  };

  const declineRequest = async (requesterProfile) => {
    const myReceived = profile.friend_requests_received || [];
    const updated = await base44.entities.UserProfile.update(profile.id, {
      friend_requests_received: myReceived.filter(x => x !== requesterProfile.user_id)
    });
    setProfile(updated);
    setPendingRequests(prev => prev.filter(p => p.id !== requesterProfile.id));
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white animate-pulse">Loading...</div>;

  const gameLabels = { maze: "Maze Quiz", bomb: "Bomb Grid", blast: "Block Blast" };
  const xpToNext = (profile?.level || 1) * 200;
  const curXP = (profile?.xp || 0) % xpToNext;
  const xpPct = Math.min((curXP / xpToNext) * 100, 100);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3 sticky top-0 bg-[#0a0a0f] z-10">
        <MobileNav profile={profile} />
        <h1 className="text-lg font-bold flex-1">Profile</h1>
        <button
          onClick={() => base44.auth.logout(createPageUrl("Dashboard"))}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">{profile?.avatar || "🎓"}</div>
              <div>
                <h2 className="text-xl font-bold">{profile?.username || "Scholar"}</h2>
                <p className="text-white/40 text-sm">{user?.email}</p>
                <p className="text-violet-400 text-sm mt-1">Level {profile?.level || 1} · {profile?.xp || 0} XP</p>
              </div>
            </div>
            <button
              onClick={() => setEditing(!editing)}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm transition-colors"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 block mb-1">Username</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-white/60 block mb-2">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {AVATARS.map(a => (
                    <button
                      key={a}
                      onClick={() => setSelectedAvatar(a)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${selectedAvatar === a ? "bg-violet-500/40 border-2 border-violet-500" : "bg-white/5 border border-white/10 hover:bg-white/10"}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={saveProfile} disabled={saving} className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold transition-colors">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-white/40 mb-1">
                  <span>XP Progress</span>
                  <span>{curXP} / {xpToNext}</span>
                </div>
                <div className="bg-white/10 rounded-full h-2">
                  <div className="bg-gradient-to-r from-violet-500 to-purple-400 h-2 rounded-full" style={{ width: `${xpPct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="font-bold">{profile?.total_questions_answered || 0}</div>
                  <div className="text-xs text-white/40">Questions</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="font-bold">{Math.round(profile?.accuracy_rate || 0)}%</div>
                  <div className="text-xs text-white/40">Accuracy</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <div className="font-bold">{profile?.badges?.length || 0}</div>
                  <div className="text-xs text-white/40">Badges</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Friend Requests */}
        {pendingRequests.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
            <h3 className="font-semibold mb-3">Friend Requests</h3>
            <div className="space-y-2">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between">
                  <span className="text-sm">{req.username}</span>
                  <div className="flex gap-2">
                    <button onClick={() => acceptRequest(req)} className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 rounded-lg text-emerald-400 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => declineRequest(req)} className="p-1.5 bg-rose-500/20 hover:bg-rose-500/40 rounded-lg text-rose-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Friends */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4 text-violet-400" /> Add Friends</h3>
          <div className="flex gap-2 mb-3">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchFriends()}
              placeholder="Search by username or email..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
            />
            <button onClick={searchFriends} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </div>
          {searchResults.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-t border-white/5">
              <span className="text-sm">{r.username}</span>
              <button
                onClick={() => sendFriendRequest(r)}
                disabled={profile?.friends?.includes(r.user_id) || profile?.friend_requests_sent?.includes(r.user_id)}
                className="px-3 py-1 bg-violet-600/50 hover:bg-violet-600 disabled:bg-white/10 disabled:cursor-not-allowed rounded-lg text-xs transition-colors"
              >
                {profile?.friends?.includes(r.user_id) ? "Friends" : profile?.friend_requests_sent?.includes(r.user_id) ? "Requested" : "Add Friend"}
              </button>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> Achievements ({achievements.length})</h3>
          {achievements.length === 0 ? (
            <p className="text-white/30 text-sm">No achievements yet. Play games to unlock them!</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {achievements.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                  <span className="text-2xl">{a.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-xs text-white/40">{a.description}</p>
                  </div>
                  <span className="text-xs text-yellow-400 font-bold">+{a.xp_reward} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Friends with Chat link */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Friends ({friendProfiles.length})</h3>
            <Link to={createPageUrl("Chat")} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> Open Chat
            </Link>
          </div>
          {friendProfiles.length === 0 ? (
            <p className="text-white/30 text-sm">No friends yet. Search for users above!</p>
          ) : (
            <div className="space-y-2">
              {friendProfiles.map(f => (
                <div key={f.id} className="flex items-center gap-3 py-2 border-t border-white/5 first:border-0">
                  <span className="text-lg">{f.avatar || "🎓"}</span>
                  <span className="text-sm font-medium">{f.username}</span>
                  <span className="ml-auto text-xs text-white/30">Lv.{f.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Game History */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Game History</h3>
          {sessions.length === 0 ? (
            <p className="text-white/30 text-sm">No games played yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => {
                const accuracy = s.total_questions > 0 ? Math.round((s.correct_answers / s.total_questions) * 100) : 0;
                const isExpanded = expandedSession === s.id;
                return (
                  <div key={s.id} className="border-t border-white/5 first:border-0">
                    <button
                      onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                      className="w-full flex items-center justify-between py-2 text-left hover:bg-white/3 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          {gameLabels[s.game_type]}
                          {!s.completed && <span className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">incomplete</span>}
                        </p>
                        <p className="text-xs text-white/40">{s.correct_answers}/{s.total_questions} correct · {accuracy}% · {s.difficulty}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm text-violet-400">+{s.xp_earned} XP</p>
                          <p className="text-xs text-white/30">{new Date(s.created_date).toLocaleDateString()}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="ml-2 mt-1 mb-2 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-emerald-500/10 rounded-lg p-2">
                            <p className="text-sm font-bold text-emerald-400">{s.correct_answers}</p>
                            <p className="text-xs text-white/40">Correct</p>
                          </div>
                          <div className="bg-rose-500/10 rounded-lg p-2">
                            <p className="text-sm font-bold text-rose-400">{s.incorrect_answers}</p>
                            <p className="text-xs text-white/40">Incorrect</p>
                          </div>
                          <div className="bg-violet-500/10 rounded-lg p-2">
                            <p className="text-sm font-bold text-violet-400">{accuracy}%</p>
                            <p className="text-xs text-white/40">Accuracy</p>
                          </div>
                        </div>
                        {s.mistakes_review?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-white/50 font-semibold">Incorrect answers:</p>
                            {s.mistakes_review.map((m, i) => (
                              <div key={i} className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2">
                                <p className="text-xs text-white/80">{m.question}</p>
                                <p className="text-xs text-emerald-400 mt-0.5">Correct: {m.correct}</p>
                                {m.explanation && <p className="text-xs text-white/40 mt-0.5">{m.explanation}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}