import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Send, MessageCircle, Smile, Check, CheckCheck } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";

const EMOJI_LIST = ["😀","😂","😍","🥰","😎","😭","😅","🤔","😱","🥳","👍","❤️","🔥","💯","🎉","😤","🙏","💀","✨","😩","🫡","😋","🤩","😏","😴","🤣","😬","🥺","😡","🤯","behh","asa","😭😭","haha","lol","😮","😢","❤️","😡","👎"];
const REACTIONS = ["👍","❤️","😂","😮","😢","😡"];

export default function Chat() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionTarget, setReactionTarget] = useState(null); // msg id
  const [friendTyping, setFriendTyping] = useState(false);
  const [showFriendList, setShowFriendList] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const bottomRef = useRef(null);
  const typingTimerRef = useRef(null);
  const emojiRef = useRef(null);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (!selectedFriend || !user) return;
    setShowFriendList(false);
    loadMessages(selectedFriend);

    const unsub = base44.entities.ChatMessage.subscribe((event) => {
      const msg = event.data;
      if (!msg) return;
      const isRelevant =
        (msg.from_user_id === user.email && msg.to_user_id === selectedFriend.user_id) ||
        (msg.from_user_id === selectedFriend.user_id && msg.to_user_id === user.email);
      if (isRelevant) {
        if (event.type === "create") {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } else if (event.type === "update") {
          setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
        }
      }
    });

    // Subscribe to typing status
    const unsubTyping = base44.entities.TypingStatus.subscribe((event) => {
      const ts = event.data;
      if (ts?.user_id === selectedFriend.user_id && ts?.to_user_id === user.email) {
        setFriendTyping(ts.is_typing && (Date.now() - new Date(ts.last_typed).getTime()) < 5000);
      }
    });

    return () => { unsub(); unsubTyping(); };
  }, [selectedFriend, user]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, friendTyping]);

  // Mark messages as seen when conversation is open
  useEffect(() => {
    if (!selectedFriend || !user || messages.length === 0) return;
    const unread = messages.filter(m => m.from_user_id === selectedFriend.user_id && !m.read);
    if (unread.length > 0) {
      Promise.all(unread.map(m => base44.entities.ChatMessage.update(m.id, { read: true, status: "seen" })));
      setMessages(prev => prev.map(m =>
        m.from_user_id === selectedFriend.user_id && !m.read ? { ...m, read: true, status: "seen" } : m
      ));
      setUnreadMessages(0);
    }
  }, [messages, selectedFriend, user]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
        setReactionTarget(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Poll online statuses
  useEffect(() => {
    if (!friends.length) return;
    const fetchStatuses = async () => {
      const statuses = await base44.entities.OnlineStatus.list();
      const map = {};
      statuses.forEach(s => {
        const isOnline = s.is_online && (Date.now() - new Date(s.last_seen).getTime() < 3 * 60 * 1000);
        map[s.user_id] = isOnline ? "online" : "offline";
      });
      setOnlineStatuses(map);
    };
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 15000);
    return () => clearInterval(interval);
  }, [friends]);

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
      const msgs = await base44.entities.ChatMessage.filter({ to_user_id: u.email, read: false });
      setUnreadMessages(msgs.length);
    } catch {
      base44.auth.redirectToLogin(createPageUrl("Chat"));
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (friend) => {
    const [sent, received] = await Promise.all([
      base44.entities.ChatMessage.filter({ from_user_id: user.email, to_user_id: friend.user_id }, "created_date", 60),
      base44.entities.ChatMessage.filter({ from_user_id: friend.user_id, to_user_id: user.email }, "created_date", 60)
    ]);
    const all = [...sent, ...received].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    setMessages(all);

    // Mark as delivered immediately
    const undelivered = received.filter(m => m.status === "sent");
    if (undelivered.length > 0) {
      Promise.all(undelivered.map(m => base44.entities.ChatMessage.update(m.id, { delivered: true, status: "delivered" })));
    }
  };

  const handleTyping = (e) => {
    setNewMsg(e.target.value);
    if (!user || !selectedFriend) return;

    clearTimeout(typingTimerRef.current);
    base44.entities.TypingStatus.filter({ user_id: user.email, to_user_id: selectedFriend.user_id }).then(existing => {
      const data = { user_id: user.email, username: profile?.username || user.email, to_user_id: selectedFriend.user_id, is_typing: true, last_typed: new Date().toISOString() };
      if (existing.length > 0) {
        base44.entities.TypingStatus.update(existing[0].id, data);
      } else {
        base44.entities.TypingStatus.create(data);
      }
    });

    typingTimerRef.current = setTimeout(() => {
      base44.entities.TypingStatus.filter({ user_id: user.email, to_user_id: selectedFriend.user_id }).then(existing => {
        if (existing.length > 0) base44.entities.TypingStatus.update(existing[0].id, { is_typing: false });
      });
    }, 3000);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedFriend || sending) return;
    setSending(true);
    const friendOnline = onlineStatuses[selectedFriend.user_id] === "online";
    const msg = await base44.entities.ChatMessage.create({
      from_user_id: user.email,
      to_user_id: selectedFriend.user_id,
      from_username: profile?.username || user.email,
      from_avatar: profile?.avatar || "🎓",
      content: newMsg.trim(),
      status: friendOnline ? "delivered" : "sent",
      delivered: friendOnline,
      read: false
    });
    setMessages(prev => [...prev, msg]);
    setNewMsg("");
    setSending(false);
    setShowEmojiPicker(false);
    // Stop typing indicator
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    base44.entities.TypingStatus.filter({ user_id: user.email, to_user_id: selectedFriend.user_id }).then(existing => {
      if (existing.length > 0) base44.entities.TypingStatus.update(existing[0].id, { is_typing: false });
    });
  };

  const addReaction = async (msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = msg.reactions || [];
    const existing = reactions.find(r => r.user_id === user.email);
    let newReactions;
    if (existing?.emoji === emoji) {
      newReactions = reactions.filter(r => r.user_id !== user.email);
    } else {
      newReactions = [...reactions.filter(r => r.user_id !== user.email), { user_id: user.email, emoji }];
    }
    await base44.entities.ChatMessage.update(msgId, { reactions: newReactions });
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: newReactions } : m));
    setReactionTarget(null);
  };

  const getStatusIcon = (msg) => {
    if (msg.from_user_id !== user?.email) return null;
    if (msg.status === "seen" || msg.read) return <CheckCheck className="w-3 h-3 text-violet-400" />;
    if (msg.status === "delivered" || msg.delivered) return <CheckCheck className="w-3 h-3 text-white/40" />;
    return <Check className="w-3 h-3 text-white/40" />;
  };

  const friendStatus = selectedFriend ? (onlineStatuses[selectedFriend.user_id] === "online" ? "🟢 Online" : "⚫ Offline") : "";

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white animate-pulse">Loading...</div>;

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3 shrink-0 bg-[#0a0a0f] z-10">
        <MobileNav unreadMessages={unreadMessages} profile={profile} />
        {selectedFriend && !showFriendList ? (
          <button onClick={() => { setShowFriendList(true); setSelectedFriend(null); }} className="text-white/40 hover:text-white transition-colors md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : null}
        {selectedFriend && !showFriendList ? (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xl">{selectedFriend.avatar || "🎓"}</span>
            <div>
              <p className="font-semibold text-sm leading-none">{selectedFriend.username}</p>
              <p className="text-xs text-white/40 mt-0.5">{friendStatus}</p>
            </div>
          </div>
        ) : (
          <h1 className="text-lg font-bold flex items-center gap-2 flex-1">
            <MessageCircle className="w-5 h-5 text-violet-400" /> Messages
          </h1>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Friends list — hidden on mobile when chat is open */}
        <div className={`${showFriendList ? "flex" : "hidden"} md:flex w-full md:w-64 border-r border-white/5 flex-col shrink-0`}>
          <div className="p-3 border-b border-white/5">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Friends ({friends.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friends.length === 0 ? (
              <div className="p-4 text-center text-white/30 text-sm">
                <p>No friends yet.</p>
                <a href={createPageUrl("Profile")} className="text-violet-400 hover:underline text-xs mt-1 block">Add friends →</a>
              </div>
            ) : (
              friends.map(f => {
                const isOnline = onlineStatuses[f.user_id] === "online";
                return (
                  <button
                    key={f.id}
                    onClick={() => { setSelectedFriend(f); setMessages([]); setShowFriendList(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${selectedFriend?.id === f.id ? "bg-violet-500/10 border-r-2 border-violet-500" : ""}`}
                  >
                    <div className="relative">
                      <span className="text-2xl">{f.avatar || "🎓"}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0f] ${isOnline ? "bg-emerald-400" : "bg-white/20"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.username}</p>
                      <p className="text-xs text-white/30">{isOnline ? "Online" : "Offline"}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={`${!showFriendList ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
          {!selectedFriend ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/30">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a friend to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop friend header */}
              <div className="hidden md:flex px-4 py-3 border-b border-white/5 items-center gap-3 shrink-0">
                <div className="relative">
                  <span className="text-xl">{selectedFriend.avatar || "🎓"}</span>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0f] ${onlineStatuses[selectedFriend.user_id] === "online" ? "bg-emerald-400" : "bg-white/20"}`} />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedFriend.username}</p>
                  <p className="text-xs text-white/40">{friendStatus}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {messages.map((msg) => {
                  const isMe = msg.from_user_id === user.email;
                  const groupedReactions = (msg.reactions || []).reduce((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {});
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group relative`}>
                      <div className="max-w-[75%] flex flex-col">
                        <div
                          className={`relative px-3.5 py-2 rounded-2xl text-sm ${isMe ? "bg-violet-600 text-white rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm"}`}
                          onLongPress={() => setReactionTarget(msg.id)}
                        >
                          <p className="break-words leading-relaxed">{msg.content}</p>
                          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-end" : "justify-start"}`}>
                            <p className="text-[10px] opacity-50">
                              {new Date(msg.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {getStatusIcon(msg)}
                          </div>

                          {/* Reaction button - show on hover */}
                          <button
                            onClick={() => setReactionTarget(reactionTarget === msg.id ? null : msg.id)}
                            className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1a1a2e] border border-white/10 rounded-full p-0.5"
                          >
                            <Smile className="w-3.5 h-3.5 text-white/50" />
                          </button>
                        </div>

                        {/* Reactions display */}
                        {Object.keys(groupedReactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                            {Object.entries(groupedReactions).map(([emoji, count]) => (
                              <button
                                key={emoji}
                                onClick={() => addReaction(msg.id, emoji)}
                                className="flex items-center gap-0.5 bg-white/10 hover:bg-white/20 rounded-full px-1.5 py-0.5 text-xs transition-colors"
                              >
                                {emoji} {count > 1 && <span className="text-white/60">{count}</span>}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction picker for this message */}
                        {reactionTarget === msg.id && (
                          <div ref={emojiRef} className={`absolute z-20 flex gap-1 bg-[#1a1a2e] border border-white/10 rounded-full px-2 py-1.5 shadow-xl ${isMe ? "right-0" : "left-0"} -top-10`}>
                            {REACTIONS.map(e => (
                              <button key={e} onClick={() => addReaction(msg.id, e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {friendTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white/10 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-1">
                      <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-white/5 shrink-0 bg-[#0a0a0f]">
                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div ref={emojiRef} className="mb-2 bg-[#1a1a2e] border border-white/10 rounded-2xl p-3 max-h-40 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJI_LIST.map((e, i) => (
                        <button
                          key={i}
                          onClick={() => { setNewMsg(prev => prev + e); setShowEmojiPicker(false); }}
                          className="text-xl hover:scale-125 transition-transform p-0.5"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2.5 text-white/40 hover:text-white transition-colors shrink-0"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <input
                    value={newMsg}
                    onChange={handleTyping}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder="Message..."
                    className="flex-1 bg-white/8 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !newMsg.trim()}
                    className="p-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl transition-colors shrink-0"
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