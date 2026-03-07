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

      {/* Render menu via portal so it's never clipped by parent containers */}
      {open && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex" }}>
          {/* Backdrop */}
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)" }}
            onPointerDown={() => setOpen(false)}
          />

          {/* Slide-out Panel */}
          <div style={{
            position: "relative", zIndex: 1,
            display: "flex", flexDirection: "column",
            width: 288, height: "100%",
            background: "#0d0d14",
            borderRight: "2px solid rgba(109,40,217,0.3)",
            boxShadow: "4px 0 24px rgba(0,0,0,0.8)",
            overflowY: "auto"
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0a0a12", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap style={{ width: 16, height: 16, color: "white" }} />
                </div>
                <span style={{ fontWeight: 700, color: "white", fontSize: 15, letterSpacing: "-0.3px" }}>Study Quest</span>
              </div>
              <button
                onPointerDown={(e) => { e.stopPropagation(); setOpen(false); }}
                style={{ padding: "8px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}
              >
                <X style={{ width: 20, height: 20, color: "rgba(255,255,255,0.7)" }} />
              </button>
            </div>

            {/* User Info */}
            {profile && (
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0a0a12", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {profile.avatar || "🎓"}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: "white", margin: 0 }}>{profile.username}</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0 }}>Level {profile.level} · {profile.xp} XP</p>
                  </div>
                </div>
              </div>
            )}

            {/* Nav Items */}
            <nav style={{ padding: "12px", flex: 1 }}>
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === "/" + item.to || location.pathname.endsWith("/" + item.to);
                const isChatWithBadge = item.to === "Chat" && unreadMessages > 0;
                return (
                  <Link
                    key={item.label}
                    to={createPageUrl(item.to)}
                    onPointerDown={() => setOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", borderRadius: 12, marginBottom: 4,
                      textDecoration: "none", fontSize: 14, fontWeight: 500,
                      touchAction: "manipulation",
                      color: "white",
                      background: isActive ? "rgba(139,92,246,0.2)" : "transparent",
                      border: isActive ? "1px solid rgba(139,92,246,0.35)" : "1px solid transparent",
                      transition: "background 0.15s"
                    }}
                  >
                    <span style={{ color: isActive ? "#a78bfa" : "rgba(255,255,255,0.55)", display: "flex" }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {isChatWithBadge && (
                      <span style={{ marginLeft: "auto", width: 20, height: 20, background: "#ef4444", color: "white", fontSize: 10, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                        {unreadMessages > 9 ? "9+" : unreadMessages}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}