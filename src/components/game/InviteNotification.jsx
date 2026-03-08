import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, X, Check } from "lucide-react";

// Polls for pending invites for the current user and shows accept/decline UI
export default function InviteNotification({ userId, onAccepted }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const poll = async () => {
      const invites = await base44.entities.GameInvite.filter({ to_user_id: userId, status: "pending" });
      if (invites.length > 0) setInvite(invites[0]);
      else setInvite(null);
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [userId]);

  if (!invite) return null;

  const accept = async () => {
    setLoading(true);
    await base44.entities.GameInvite.update(invite.id, { status: "accepted" });
    // The MultiplayerSession was already created by the inviter — find it by player IDs
    let session = null;
    for (let i = 0; i < 10; i++) {
      const sessions = await base44.entities.MultiplayerSession.filter({
        player1_id: invite.from_user_id,
        player2_id: invite.to_user_id,
        status: "active"
      });
      if (sessions.length > 0) { session = sessions[0]; break; }
      await new Promise(r => setTimeout(r, 1200));
    }
    setInvite(null);
    setLoading(false);
    if (session) onAccepted(session, invite);
  };

  const decline = async () => {
    await base44.entities.GameInvite.update(invite.id, { status: "declined" });
    setInvite(null);
  };

  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 99999, background: "#1a1a2e", border: "1px solid rgba(139,92,246,0.5)",
      borderRadius: 16, padding: "16px 20px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", gap: 14, minWidth: 300, maxWidth: 380
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Users style={{ width: 18, height: 18, color: "#a78bfa" }} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ color: "white", fontWeight: 600, fontSize: 14, margin: 0 }}>Game Invite!</p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "2px 0 0" }}>
          <strong style={{ color: "rgba(255,255,255,0.8)" }}>{invite.from_username}</strong> invited you to Maze Quiz
        </p>
      </div>
      <button
        onClick={accept}
        disabled={loading}
        style={{ padding: "7px 14px", background: "#7c3aed", border: "none", borderRadius: 10, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
      >
        <Check style={{ width: 14, height: 14 }} /> {loading ? "..." : "Join"}
      </button>
      <button
        onClick={decline}
        style={{ padding: 7, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.5)" }} />
      </button>
    </div>
  );
}