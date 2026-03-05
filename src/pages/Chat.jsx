import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";

export default function Chat() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!selectedFriend || !user) return;
    loadMessages(selectedFriend);
    const unsub = base44.entities.ChatMessage.subscribe((event) => {
      const msg = event.data;
      if (
        (msg.from_user_id === user.email && msg.to_user_id === selectedFriend.user_id) ||
        (msg.from_user_id === selectedFriend.user_id && msg.to_user_id === user.email)
      ) {
        if (event.type === "create") setMessages(prev => [...prev, msg]);
      }
    });
    return () => unsub();
  }, [selectedFriend, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const init = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
      const profiles = await base44.entities.UserProfile.filter({ user_id: u.email });
      if (profiles.length > 0) {
        const p = profiles[0];
        setProfile(p);
        if (p.friends?.length) {
          const all = await Promise.all(p.friends.map(fid => base44.entities.UserProfile.filter({ user_id: fid })));
          setFriends(all.flat());
        }
      }
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Chat"));
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (friend) => {
    const sent = await base44.entities.ChatMessage.filter({ from_user_id: user.email, to_user_id: friend.user_id }, "created_date", 50);
    const received = await base44.entities.ChatMessage.filter({ from_user_id: friend.user_id, to_user_id: user.email }, "created_date", 50);
    const all = [...sent, ...received].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    setMessages(all);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedFriend) return;
    setSending(true);
    await base44.entities.ChatMessage.create({
      from_user_id: user.email,
      to_user_id: selectedFriend.user_id,
      from_username: profile?.username || user.email,
      from_avatar: profile?.avatar || "🎓",
      content: newMsg.trim()
    });
    setNewMsg("");
    setSending(false);
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white animate-pulse">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4 shrink-0">
        <Link to={createPageUrl("Dashboard")} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-violet-400" /> Friend Chat
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Friends sidebar */}
        <div className="w-64 border-r border-white/5 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Friends ({friends.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friends.length === 0 ? (
              <div className="p-4 text-center text-white/30 text-sm">
                <p>No friends yet.</p>
                <Link to={createPageUrl("Profile")} className="text-violet-400 hover:underline text-xs mt-1 block">Add friends →</Link>
              </div>
            ) : (
              friends.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFriend(f); setMessages([]); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${selectedFriend?.id === f.id ? "bg-violet-500/10 border-r-2 border-violet-500" : ""}`}
                >
                  <span className="text-2xl">{f.avatar || "🎓"}</span>
                  <div>
                    <p className="text-sm font-medium">{f.username}</p>
                    <p className="text-xs text-white/30">Lv.{f.level || 1}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedFriend ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/30">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a friend to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3 shrink-0">
                <span className="text-xl">{selectedFriend.avatar || "🎓"}</span>
                <span className="font-semibold">{selectedFriend.username}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isMe = msg.from_user_id === user.email;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-violet-600 text-white rounded-br-md" : "bg-white/8 text-white rounded-bl-md"}`}>
                        <p>{msg.content}</p>
                        <p className="text-xs opacity-50 mt-1 text-right">
                          {new Date(msg.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="p-4 border-t border-white/5 shrink-0">
                <div className="flex gap-2">
                  <input
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !newMsg.trim()}
                    className="p-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}