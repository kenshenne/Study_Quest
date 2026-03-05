import { base44 } from "@/api/base44Client";

export const ACHIEVEMENTS = [
  { key: "perfect_score", title: "Perfect Score", description: "Answer all questions correctly in a game", icon: "🎯", xp_reward: 100 },
  { key: "first_game", title: "First Steps", description: "Complete your first game", icon: "🎮", xp_reward: 25 },
  { key: "speed_demon", title: "Speed Demon", description: "Complete a Maze in under 60 seconds", icon: "⚡", xp_reward: 75 },
  { key: "bomb_defuser", title: "Bomb Defuser", description: "Complete Bomb Grid with a perfect score", icon: "🚩", xp_reward: 50 },
  { key: "century", title: "Century Club", description: "Answer 100 questions total", icon: "💯", xp_reward: 150 },
  { key: "accurate", title: "Sharp Shooter", description: "Reach 90% accuracy overall", icon: "🏹", xp_reward: 80 },
  { key: "level_5", title: "Rising Star", description: "Reach Level 5", icon: "⭐", xp_reward: 100 },
  { key: "all_games", title: "Versatile", description: "Play all 3 game types", icon: "🎲", xp_reward: 60 },
];

export async function checkAndAwardAchievements(userId, profile, sessionStats, allSessions) {
  const existing = await base44.entities.Achievement.filter({ user_id: userId });
  const existingKeys = new Set(existing.map(a => a.key));
  const newAchievements = [];

  const award = async (def) => {
    if (!def || existingKeys.has(def.key)) return;
    const ach = await base44.entities.Achievement.create({ user_id: userId, ...def });
    newAchievements.push(ach);
    existingKeys.add(def.key);
    // Award XP
    try {
      const newXP = (profile.xp || 0) + def.xp_reward;
      await base44.entities.UserProfile.update(profile.id, {
        xp: newXP,
        level: Math.floor(newXP / 200) + 1
      });
      profile.xp = newXP;
    } catch {}
  };

  // First game
  if (allSessions.length >= 1) await award(ACHIEVEMENTS.find(a => a.key === "first_game"));

  // Perfect score
  if (sessionStats && sessionStats.total > 0 && sessionStats.incorrect === 0)
    await award(ACHIEVEMENTS.find(a => a.key === "perfect_score"));

  // Speed demon (maze < 60s)
  if (sessionStats?.game_type === "maze" && sessionStats?.time_seconds > 0 && sessionStats.time_seconds < 60)
    await award(ACHIEVEMENTS.find(a => a.key === "speed_demon"));

  // Bomb defuser
  if (sessionStats?.game_type === "bomb" && sessionStats?.total > 0 && sessionStats?.incorrect === 0)
    await award(ACHIEVEMENTS.find(a => a.key === "bomb_defuser"));

  // Century
  const totalQ = (profile.total_questions_answered || 0);
  if (totalQ >= 100) await award(ACHIEVEMENTS.find(a => a.key === "century"));

  // Accurate
  if ((profile.accuracy_rate || 0) >= 90 && totalQ > 10)
    await award(ACHIEVEMENTS.find(a => a.key === "accurate"));

  // Level 5
  if ((profile.level || 1) >= 5) await award(ACHIEVEMENTS.find(a => a.key === "level_5"));

  // All games
  const gameTypes = new Set(allSessions.map(s => s.game_type));
  if (gameTypes.has("maze") && gameTypes.has("bomb") && gameTypes.has("blast"))
    await award(ACHIEVEMENTS.find(a => a.key === "all_games"));

  return newAchievements;
}

export async function updateOnlineStatus(userId, username, avatar) {
  const existing = await base44.entities.OnlineStatus.filter({ user_id: userId });
  const data = { user_id: userId, username, avatar, last_seen: new Date().toISOString(), is_online: true };
  if (existing.length > 0) {
    await base44.entities.OnlineStatus.update(existing[0].id, data);
  } else {
    await base44.entities.OnlineStatus.create(data);
  }
}

export async function setOffline(userId) {
  const existing = await base44.entities.OnlineStatus.filter({ user_id: userId });
  if (existing.length > 0) {
    await base44.entities.OnlineStatus.update(existing[0].id, { is_online: false, last_seen: new Date().toISOString() });
  }
}