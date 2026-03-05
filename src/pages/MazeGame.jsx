import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, User } from "lucide-react";
import QuestionModal from "../components/game/QuestionModal";
import GameOverModal from "../components/game/GameOverModal";
import MaterialSelector from "../components/game/MaterialSelector";
import AchievementToast from "../components/achievements/AchievementToast";
import { checkAndAwardAchievements } from "../components/achievements/achievementsLib";

const CELL_SIZE = 40;
const COLS = 15;
const ROWS = 12;

function generateMaze(cols, rows) {
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ r, c, walls: [true, true, true, true], visited: false }))
  );
  const stack = [];
  const start = grid[0][0];
  start.visited = true;
  stack.push(start);

  const dirs = [[0, -1, 0, 2], [1, 0, 3, 1], [0, 1, 2, 0], [-1, 0, 1, 3]];

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const neighbors = dirs.map(([dc, dr, wall1, wall2]) => {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !grid[nr][nc].visited) {
        return { cell: grid[nr][nc], wall1, wall2 };
      }
      return null;
    }).filter(Boolean);

    if (neighbors.length === 0) { stack.pop(); continue; }
    const { cell, wall1, wall2 } = neighbors[Math.floor(Math.random() * neighbors.length)];
    cur.walls[wall1] = false;
    cell.walls[wall2] = false;
    cell.visited = true;
    stack.push(cell);
  }
  return grid;
}

function placeCheckpoints(maze, questions) {
  const count = Math.min(questions.length, 8);
  const checkpoints = new Set();
  while (checkpoints.size < count) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (r === 0 && c === 0) continue;
    checkpoints.add(`${r},${c}`);
  }
  return [...checkpoints].map(pos => {
    const [r, c] = pos.split(",").map(Number);
    return { r, c };
  });
}

export default function MazeGame() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("setup"); // setup | inviting | playing | over
  const [materialId, setMaterialId] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [maze, setMaze] = useState(null);
  const [player, setPlayer] = useState({ r: 0, c: 0 });
  const [checkpoints, setCheckpoints] = useState([]);
  const [visitedCheckpoints, setVisitedCheckpoints] = useState(new Set());
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [gameStats, setGameStats] = useState({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
  const [startTime, setStartTime] = useState(null);
  const [friends, setFriends] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [playMode, setPlayMode] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const gameRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      base44.entities.UserProfile.filter({ user_id: u.email }).then(profiles => {
        if (profiles.length > 0) {
          setProfile(profiles[0]);
          loadFriends(profiles[0]);
        }
      });
    }).catch(() => base44.auth.redirectToLogin(createPageUrl("MazeGame")));
  }, []);

  const loadFriends = async (p) => {
    if (!p.friends?.length) return;
    const all = await Promise.all(p.friends.map(fid => base44.entities.UserProfile.filter({ user_id: fid })));
    setFriends(all.flat());
  };

  const startGame = async (matId) => {
    const qs = await base44.entities.Question.filter({ material_id: matId, user_id: user.email, difficulty });
    if (qs.length === 0) {
      alert("No questions found for this material and difficulty. Please upload materials first.");
      return;
    }
    const shuffled = [...qs].sort(() => Math.random() - 0.5);
    const limited = shuffled.slice(0, Math.min(shuffled.length, difficulty === "easy" ? 15 : difficulty === "medium" ? 25 : 35));
    setQuestions(limited);
    const newMaze = generateMaze(COLS, ROWS);
    const cps = placeCheckpoints(newMaze, limited);
    setMaze(newMaze);
    setCheckpoints(cps);
    setPlayer({ r: 0, c: 0 });
    setVisitedCheckpoints(new Set());
    setQIndex(0);
    setGameStats({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
    setStartTime(Date.now());
    // Create session immediately for partial-game saving
    try {
      const s = await base44.entities.GameSession.create({
        user_id: user.email, username: profile?.username || user.email,
        game_type: "maze", difficulty, material_id: matId,
        score: 0, xp_earned: 0, total_questions: 0,
        correct_answers: 0, incorrect_answers: 0, completed: false
      });
      setSessionId(s.id);
    } catch {}
    setPhase("playing");
    setTimeout(() => gameRef.current?.focus(), 100);
  };

  const handleKeyDown = useCallback((e) => {
    if (phase !== "playing" || activeQuestion) return;
    const moves = {
      ArrowUp: { dr: -1, dc: 0, wall: 0 },
      ArrowDown: { dr: 1, dc: 0, wall: 2 },
      ArrowRight: { dr: 0, dc: 1, wall: 1 },
      ArrowLeft: { dr: 0, dc: -1, wall: 3 }
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const { dr, dc, wall } = move;
    const nr = player.r + dr;
    const nc = player.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
    if (maze[player.r][player.c].walls[wall]) return;

    const newPos = { r: nr, c: nc };
    setPlayer(newPos);

    // Check checkpoint
    const cpKey = `${nr},${nc}`;
    const cpIdx = checkpoints.findIndex(cp => cp.r === nr && cp.c === nc);
    if (cpIdx !== -1 && !visitedCheckpoints.has(cpKey)) {
      const q = questions[qIndex];
      if (q) setActiveQuestion(q);
    }

    // Check exit (bottom-right)
    if (nr === ROWS - 1 && nc === COLS - 1 && visitedCheckpoints.size >= checkpoints.length) {
      endGame();
    }
  }, [phase, activeQuestion, player, maze, checkpoints, visitedCheckpoints, qIndex, questions]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleAnswer = (correct) => {
    const q = activeQuestion;
    const cpKey = `${player.r},${player.c}`;
    const newVisited = new Set(visitedCheckpoints);
    newVisited.add(cpKey);

    const xpGain = correct ? (difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30) : 0;
    const newStats = {
      ...gameStats,
      correct: gameStats.correct + (correct ? 1 : 0),
      incorrect: gameStats.incorrect + (correct ? 0 : 1),
      total: gameStats.total + 1,
      xp: gameStats.xp + xpGain,
      mistakes: correct ? gameStats.mistakes : [...gameStats.mistakes, {
        question: q.question_text,
        yourAnswer: "incorrect",
        correct: q.correct_answer,
        explanation: q.explanation
      }]
    };
    setGameStats(newStats);
    setVisitedCheckpoints(newVisited);
    setQIndex(prev => prev + 1);
    setActiveQuestion(null);

    if (!correct) {
      // Teleport to random location
      const nr = Math.floor(Math.random() * ROWS);
      const nc = Math.floor(Math.random() * COLS);
      setPlayer({ r: nr, c: nc });
    }

    if (newStats.total >= questions.length) {
      endGame(newStats);
    }
  };

  const endGame = async (finalStats = gameStats) => {
    if (!user) return;
    const time = Math.floor((Date.now() - startTime) / 1000);
    try {
      const sessionData = {
        score: finalStats.correct * (difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30),
        xp_earned: finalStats.xp, total_questions: finalStats.total,
        correct_answers: finalStats.correct, incorrect_answers: finalStats.incorrect,
        time_seconds: time, completed: true, mistakes_review: finalStats.mistakes
      };
      if (sessionId) {
        await base44.entities.GameSession.update(sessionId, sessionData);
      } else {
        await base44.entities.GameSession.create({ user_id: user.email, username: profile?.username || user.email, game_type: "maze", difficulty, material_id: materialId, ...sessionData });
      }
      if (profile) {
        const newXP = (profile.xp || 0) + finalStats.xp;
        const newTotal = (profile.total_questions_answered || 0) + finalStats.total;
        const newCorrect = (profile.total_correct || 0) + finalStats.correct;
        const updatedProfile = await base44.entities.UserProfile.update(profile.id, {
          xp: newXP, level: Math.floor(newXP / 200) + 1,
          total_questions_answered: newTotal, total_correct: newCorrect,
          accuracy_rate: newTotal > 0 ? (newCorrect / newTotal) * 100 : 0
        });
        const allSessions = await base44.entities.GameSession.filter({ user_id: user.email }, "-created_date", 100);
        const earned = await checkAndAwardAchievements(user.email, { ...updatedProfile, accuracy_rate: newTotal > 0 ? (newCorrect / newTotal) * 100 : 0 }, { ...finalStats, game_type: "maze", time_seconds: time }, allSessions);
        if (earned.length > 0) setNewAchievements(earned);
      }
    } catch (e) { console.error(e); }
    setGameStats(finalStats);
    setPhase("over");
  };

  const exitGame = () => endGame();

  const sendInvite = async (friendProfile) => {
    await base44.entities.GameInvite.create({
      from_user_id: user.email,
      from_username: profile?.username || user.email,
      to_user_id: friendProfile.user_id,
      game_type: "maze",
      material_id: materialId,
      difficulty,
      status: "pending"
    });
    setShowInvite(false);
    startGame(materialId);
  };

  const canvasW = COLS * CELL_SIZE;
  const canvasH = ROWS * CELL_SIZE;

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="text-white/40 hover:text-white transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-xl font-bold">Maze Quiz</h1>
        </header>
        <main className="max-w-md mx-auto px-6 py-10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Game Setup</h2>
            {user && <MaterialSelector userId={user.email} onSelect={(id) => { setMaterialId(id); setPlayMode(null); }} difficulty={difficulty} onDifficultyChange={setDifficulty} />}
            {materialId && !playMode && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-white/60 mb-2">Play Mode</p>
                <button onClick={() => { setPlayMode("solo"); startGame(materialId); }} className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                  <User className="w-4 h-4" /> Play Solo
                </button>
                {friends.length > 0 && (
                  <button onClick={() => setShowInvite(true)} className="w-full py-3 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors text-violet-300">
                    <Users className="w-4 h-4" /> Invite a Friend
                  </button>
                )}
              </div>
            )}
          </div>

          {showInvite && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-3">Select Friend to Invite</h3>
              {friends.map(f => (
                <button key={f.id} onClick={() => sendInvite(f)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/50 text-sm mb-2 transition-all flex items-center gap-3">
                  <span className="text-lg">{f.avatar || "🎓"}</span>
                  <span>{f.username}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <>
        <GameOverModal stats={gameStats} onRestart={() => { setSessionId(null); setPhase("setup"); }} gameType="maze" />
        {newAchievements.map((a, i) => (
          <AchievementToast key={a.id || i} achievement={a} onDone={() => setNewAchievements(prev => prev.slice(1))} />
        ))}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={exitGame} className="text-white/40 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <h1 className="font-bold text-sm">Maze Quiz</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/50">
          <span>✅ {gameStats.correct}</span>
          <span>❌ {gameStats.incorrect}</span>
          <span>📍 {visitedCheckpoints.size}/{checkpoints.length}</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4" ref={gameRef} tabIndex={0} style={{ outline: "none" }}>
        <div className="relative">
          <svg width={canvasW} height={canvasH} style={{ display: "block", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
            <rect width={canvasW} height={canvasH} fill="#0d0d18" rx={12} />
            {/* Exit marker */}
            <rect x={(COLS - 1) * CELL_SIZE} y={(ROWS - 1) * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE} fill="rgba(16,185,129,0.2)" rx={4} />
            <text x={(COLS - 1) * CELL_SIZE + CELL_SIZE / 2} y={(ROWS - 1) * CELL_SIZE + CELL_SIZE / 2 + 5} textAnchor="middle" fontSize={18}>🏁</text>

            {/* Checkpoints */}
            {checkpoints.map((cp, i) => {
              const visited = visitedCheckpoints.has(`${cp.r},${cp.c}`);
              return (
                <g key={i}>
                  <rect x={cp.c * CELL_SIZE + 4} y={cp.r * CELL_SIZE + 4} width={CELL_SIZE - 8} height={CELL_SIZE - 8} fill={visited ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.3)"} rx={4} />
                  <text x={cp.c * CELL_SIZE + CELL_SIZE / 2} y={cp.r * CELL_SIZE + CELL_SIZE / 2 + 5} textAnchor="middle" fontSize={14}>{visited ? "✓" : "❓"}</text>
                </g>
              );
            })}

            {/* Walls */}
            {maze && maze.flat().map((cell, idx) => {
              const x = cell.c * CELL_SIZE;
              const y = cell.r * CELL_SIZE;
              const stroke = "rgba(99,102,241,0.4)";
              const sw = 2;
              return (
                <g key={idx}>
                  {cell.walls[0] && <line x1={x} y1={y} x2={x + CELL_SIZE} y2={y} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[1] && <line x1={x + CELL_SIZE} y1={y} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[2] && <line x1={x} y1={y + CELL_SIZE} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[3] && <line x1={x} y1={y} x2={x} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                </g>
              );
            })}

            {/* Player */}
            <circle cx={player.c * CELL_SIZE + CELL_SIZE / 2} cy={player.r * CELL_SIZE + CELL_SIZE / 2} r={CELL_SIZE / 2 - 6} fill="rgba(139,92,246,0.9)" />
            <text x={player.c * CELL_SIZE + CELL_SIZE / 2} y={player.r * CELL_SIZE + CELL_SIZE / 2 + 5} textAnchor="middle" fontSize={16}>🧙</text>
          </svg>

          <p className="text-center text-xs text-white/30 mt-2">Use arrow keys to navigate · Reach ❓ to answer questions</p>
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="flex flex-col items-center gap-1 p-4 md:hidden">
        {[
          { key: "ArrowUp", label: "↑" },
        ].map(({ key, label }) => (
          <button key={key} onTouchStart={() => handleKeyDown({ key, preventDefault: () => {} })} className="w-12 h-12 bg-white/10 rounded-xl text-lg font-bold">{label}</button>
        ))}
        <div className="flex gap-1">
          {[{ key: "ArrowLeft", label: "←" }, { key: "ArrowDown", label: "↓" }, { key: "ArrowRight", label: "→" }].map(({ key, label }) => (
            <button key={key} onTouchStart={() => handleKeyDown({ key, preventDefault: () => {} })} className="w-12 h-12 bg-white/10 rounded-xl text-lg font-bold">{label}</button>
          ))}
        </div>
      </div>

      {activeQuestion && (
        <QuestionModal
          question={activeQuestion}
          onAnswer={handleAnswer}
          onClose={() => setActiveQuestion(null)}
          showHint={difficulty !== "hard"}
        />
      )}
    </div>
  );
}