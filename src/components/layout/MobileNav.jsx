import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Menu, X, Zap, LayoutDashboard, Upload, Swords, Trophy, User, MessageCircle } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", to: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Materials", to: "Upload", icon: <Upload className="w-5 h-5" /> },
  { label: "Games", to: "Dashboard", icon: <Swords className="w-5 h-5" /> },
  { label: "Leaderboard", to: "Leaderboard", icon: <Trophy className="w-5 h-5" /> },
  { label: "Chat", to: "Chat", icon: <MessageCircle className="w-5 h-5" /> },
  { label: "Profile", to: "Profile", icon: <User className="w-5 h-5" /> },
];

export default function MobileNav({ unreadMessages = 0, profile }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onPointerDown={() => setOpen(true)}
        className="p-2 rounded-xl text-white bg-white/10 hover:bg-white/20 transition-colors touch-manipulation"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6 text-white" />
      </button>

      {/* Full-screen portal for menu */}
      {open && (
        <div className="fixed inset-0 z-[9999] flex" style={{ isolation: "isolate" }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80"
            onPointerDown={() => setOpen(false)}
          />

          {/* Slide-out Panel — fully opaque, no transparency */}
          <div className="relative z-10 flex flex-col w-72 h-full bg-[#0d0d14] border-r-2 border-violet-900/40 shadow-2xl overflow-y-auto">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0a0a12] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white text-base tracking-tight">Study Quest</span>
              </div>
              <button
                onPointerDown={() => setOpen(false)}
                className="p-2 rounded-xl text-white/60 hover:text-white bg-white/5 hover:bg-white/15 transition-colors touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Info */}
            {profile && (
              <div className="px-5 py-4 border-b border-white/10 bg-[#0a0a12] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 flex items-center justify-center text-xl">
                    {profile.avatar || "🎓"}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">{profile.username}</p>
                    <p className="text-xs text-white/50">Level {profile.level} · {profile.xp} XP</p>
                  </div>
                </div>
              </div>
            )}

            {/* Nav Items */}
            <nav className="px-3 py-4 space-y-1 flex-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === "/" + item.to || location.pathname.endsWith("/" + item.to);
                const isChatWithBadge = item.to === "Chat" && unreadMessages > 0;
                return (
                  <Link
                    key={item.label}
                    to={createPageUrl(item.to)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-sm font-medium touch-manipulation ${
                      isActive
                        ? "bg-violet-600/25 text-white border border-violet-500/40"
                        : "text-white hover:bg-white/10 border border-transparent"
                    }`}
                  >
                    <span className={isActive ? "text-violet-400" : "text-white/60"}>{item.icon}</span>
                    <span>{item.label}</span>
                    {isChatWithBadge && (
                      <span className="ml-auto w-5 h-5 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                        {unreadMessages > 9 ? "9+" : unreadMessages}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}