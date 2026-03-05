import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function Layout({ children, currentPageName }) {
  useEffect(() => {
    // Heartbeat: keep online status updated
    let userId = null;
    let intervalId = null;

    const startHeartbeat = async () => {
      try {
        const u = await base44.auth.me();
        if (!u) return;
        userId = u.email;
        const profiles = await base44.entities.UserProfile.filter({ user_id: u.email });
        const profile = profiles[0];

        const ping = async () => {
          const existing = await base44.entities.OnlineStatus.filter({ user_id: u.email });
          const data = {
            user_id: u.email,
            username: profile?.username || u.email,
            avatar: profile?.avatar || "🎓",
            last_seen: new Date().toISOString(),
            is_online: true
          };
          if (existing.length > 0) {
            await base44.entities.OnlineStatus.update(existing[0].id, data);
          } else {
            await base44.entities.OnlineStatus.create(data);
          }
        };

        await ping();
        intervalId = setInterval(ping, 60000); // every 60s
      } catch {}
    };

    startHeartbeat();

    const setOffline = async () => {
      if (!userId) return;
      try {
        const existing = await base44.entities.OnlineStatus.filter({ user_id: userId });
        if (existing.length > 0) {
          await base44.entities.OnlineStatus.update(existing[0].id, { is_online: false, last_seen: new Date().toISOString() });
        }
      } catch {}
    };

    window.addEventListener("beforeunload", setOffline);
    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("beforeunload", setOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <style>{`
        * { box-sizing: border-box; }
        body { background: #0a0a0f; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 999px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.5); }
        ::selection { background: rgba(139,92,246,0.3); }
      `}</style>
      {children}
    </div>
  );
}