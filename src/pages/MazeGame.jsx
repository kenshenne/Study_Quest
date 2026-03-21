import { useState, useEffect, useCallback, useRef } from "react";
import { buildQuestionPool } from "@/utils/questionUtils";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Users, User, Trophy } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";
import QuestionModal from "../components/game/QuestionModal";
import GameOverModal from "../components/game/GameOverModal";
import MaterialSelector from "../components/game/MaterialSelector";
import AchievementToast from "../components/achievements/AchievementToast";
import { checkAndAwardAchievements } from "../components/achievements/achievementsLib";

const CELL_SIZE = 40;
const COLS = 13;
const ROWS = 11;

const DIRS = [
  [-1,  0, 0, 2],
  [ 0,  1, 1, 3],
  [ 1,  0, 2, 0],
  [ 0, -1, 3, 1],
];

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateMaze(cols, rows, seed) {
  const rng = seed != null ? seededRandom(seed) : Math.random.bind(Math);
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ r, c, walls: [true, true, true, true], visited: false }))
  );
  const stack = [grid[0][0]];
  grid[0][0].visited = true;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const shuffled = [...DIRS].sort(() => rng() - 0.5);
    let moved = false;
    for (const [dr, dc, myWall, neighborWall] of shuffled) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
        cur.walls[myWall] = false;
        grid[nr][nc].walls[neighborWall] = false;
        grid[nr][nc].visited = true;
        stack.push(grid[nr][nc]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
  return grid;
}

function placeCheckpoints(maze, questions) {
  const count = Math.min(questions.length, 6);
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const queue = [{ r: 0, c: 0, dist: 0 }];
  visited[0][0] = true;
  const reachable = [];
  while (queue.length > 0) {
    const { r, c, dist } = queue.shift();
    reachable.push({ r, c, dist });
    const cell = maze[r][c];
    const moves = [
      { dr: -1, dc: 0, wall: 0 }, { dr: 0, dc: 1, wall: 1 },
      { dr: 1, dc: 0, wall: 2 }, { dr: 0, dc: -1, wall: 3 },
    ];
    for (const { dr, dc, wall } of moves) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc] && !cell.walls[wall]) {
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc, dist: dist + 1 });
      }
    }
  }
  const candidates = reachable.filter(({ r, c }) => !(r === 0 && c === 0) && !(r === ROWS - 1 && c === COLS - 1));
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Player 2 starts at top-right corner
const P1_START = { r: 0, c: 0 };
const P2_START = { r: 0, c: COLS - 1 };

const MIN_CORRECT = { easy: 5, medium: 10, hard: 15 };

function findFreeCell(existingCheckpoints, playerPos) {
  const occupied = new Set([
    '0,0', `${ROWS-1},${COLS-1}`,
    `${playerPos.r},${playerPos.c}`,
    ...existingCheckpoints.map(cp => `${cp.r},${cp.c}`)
  ]);
  const free = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!occupied.has(`${r},${c}`)) free.push({ r, c });
    }
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

export default function MazeGame() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("setup");
  const [materialId, setMaterialId] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [maze, setMaze] = useState(null);
  const [player, setPlayer] = useState(P1_START);
  const [checkpoints, setCheckpoints] = useState([]);
  const [visitedCheckpoints, setVisitedCheckpoints] = useState(new Set());
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [gameStats, setGameStats] = useState({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
  const [startTime, setStartTime] = useState(null);
  const [friends, setFriends] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [playMode, setPlayMode] = useState(null); // "solo" | "multi"
  const [sessionId, setSessionId] = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const gameRef = useRef(null);

  // Multiplayer state
  const [mpSession, setMpSession] = useState(null); // MultiplayerSession record
  const [isPlayer1, setIsPlayer1] = useState(true);
  const [opponentPos, setOpponentPos] = useState(null);
  const [opponentCheckpoints, setOpponentCheckpoints] = useState(0);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [mpOver, setMpOver] = useState(null); // { winner, myXP }
  const [opponentWon, setOpponentWon] = useState(false); // opponent won but I can still continue
  const mpPollRef = useRef(null);

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

  // ── MULTIPLAYER POLLING (500ms for near-real-time updates) ──────────────────
  const startMpPolling = useCallback((sessionId, myIsP1, myUserEmail) => {
    if (mpPollRef.current) clearInterval(mpPollRef.current);
    mpPollRef.current = setInterval(async () => {
      const sessions = await base44.entities.MultiplayerSession.filter({ id: sessionId });
      if (!sessions.length) return;
      const s = sessions[0];
      const oppPos = myIsP1 ? s.player2_pos : s.player1_pos;
      const oppCps = myIsP1 ? s.player2_checkpoints : s.player1_checkpoints;
      const oppFin = myIsP1 ? s.player2_finished : s.player1_finished;
      if (oppPos) setOpponentPos(oppPos);
      setOpponentCheckpoints(oppCps || 0);
      if (oppFin) setOpponentFinished(true);

      if (s.status === "finished") {
        clearInterval(mpPollRef.current);
        const totalXP = (s.player1_xp || 0) + (s.player2_xp || 0);
        if (s.winner_id === myUserEmail) {
          // I won — show win screen
          setMpOver({ iWon: true, totalXP });
          setPhase("mpover");
        } else {
          // Opponent won — show lose overlay (let them choose Play Again / Exit)
          setMpOver({ iWon: false, totalXP: 0 });
          setOpponentWon(true);
        }
      }
    }, 500);
  }, []);

  useEffect(() => () => { if (mpPollRef.current) clearInterval(mpPollRef.current); }, []);

  // ── START GAME ───────────────────────────────────────────────────────────────
  // ownerUserId: for multiplayer, use the inviter's (player1) user id to fetch their questions
  const startGame = async (matId, seed, mpSess, iAmP1, ownerUserId) => {
    const questionOwnerId = ownerUserId || user.email;
    const allQs = await base44.entities.Question.filter({ material_id: matId, user_id: questionOwnerId });
    if (allQs.length === 0) { alert("No questions found for this material."); return; }
    const diffQs = allQs.filter(q => q.difficulty === (mpSess?.difficulty || difficulty));
    const pool = diffQs.length >= 8 ? diffQs : allQs;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const limited = shuffled.slice(0, Math.min(shuffled.length, 15));
    setQuestions(limited);
    const newMaze = generateMaze(COLS, ROWS, seed ?? null);
    const cps = placeCheckpoints(newMaze, limited);
    setMaze(newMaze);
    setCheckpoints(cps);
    const startPos = (mpSess && !iAmP1) ? P2_START : P1_START;
    setPlayer(startPos);
    setVisitedCheckpoints(new Set());
    setQIndex(0);
    setGameStats({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
    setStartTime(Date.now());
    if (mpSess) {
      setMpSession(mpSess);
      setIsPlayer1(iAmP1);
      setOpponentPos(iAmP1 ? P2_START : P1_START);
      setOpponentWon(false);
      startMpPolling(mpSess.id, iAmP1, user.email);
    }
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

  // ── SEND INVITE ──────────────────────────────────────────────────────────────
  const sendInvite = async (friendProfile) => {
    const seed = Math.floor(Math.random() * 999999);
    const invite = await base44.entities.GameInvite.create({
      from_user_id: user.email,
      from_username: profile?.username || user.email,
      to_user_id: friendProfile.user_id,
      game_type: "maze",
      material_id: materialId,
      difficulty,
      status: "pending"
    });
    // Create shared multiplayer session immediately
    const sess = await base44.entities.MultiplayerSession.create({
      game_type: "maze",
      material_id: materialId,
      difficulty,
      player1_id: user.email,
      player1_username: profile?.username || user.email,
      player2_id: friendProfile.user_id,
      player2_username: friendProfile.username,
      player1_pos: P1_START,
      player2_pos: P2_START,
      player1_score: 0, player2_score: 0,
      player1_xp: 0, player2_xp: 0,
      player1_checkpoints: 0, player2_checkpoints: 0,
      player1_finished: false, player2_finished: false,
      status: "active",
      maze_seed: seed,
      invite_id: invite.id
    });
    setShowInvite(false);
    setPlayMode("multi");
    await startGame(materialId, seed, sess, true, user.email);
  };

  // ── ACCEPT INVITE via URL param: ?join=<multiplayerSessionId> ───────────────
  useEffect(() => {
    if (!user) return; // wait until auth is resolved
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (!joinId) return;
    const joinSession = async () => {
      const sessions = await base44.entities.MultiplayerSession.filter({ id: joinId });
      if (!sessions.length) return;
      const sess = sessions[0];
      setPlayMode("multi");
      setDifficulty(sess.difficulty || "medium");
      // Player 2 uses Player 1's questions (the inviter's material)
      await startGame(sess.material_id, sess.maze_seed, sess, false, sess.player1_id);
    };
    joinSession();
  }, [user]);

  // ── MOVEMENT ─────────────────────────────────────────────────────────────────
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
    const nr = player.r + dr, nc = player.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
    if (maze[player.r][player.c].walls[wall]) return;
    const newPos = { r: nr, c: nc };
    setPlayer(newPos);

    // Sync position in multiplayer
    if (mpSession) {
      const field = isPlayer1 ? "player1_pos" : "player2_pos";
      base44.entities.MultiplayerSession.update(mpSession.id, { [field]: newPos }).catch(() => {});
    }

    const cpKey = `${nr},${nc}`;
    const cpIdx = checkpoints.findIndex(cp => cp.r === nr && cp.c === nc);
    if (cpIdx !== -1 && !visitedCheckpoints.has(cpKey)) {
      const q = questions[qIndex];
      if (q) {
        setActiveQuestion(q);
      } else {
        // All questions exhausted — game over
        endGame();
      }
    }

    if (nr === ROWS - 1 && nc === COLS - 1) {
      const minCorrect = MIN_CORRECT[difficulty] || 5;
      // Only allow finish if min correct answers met
      if (gameStats.correct >= minCorrect) {
        endGame();
      }
    }
  }, [phase, activeQuestion, player, maze, checkpoints, visitedCheckpoints, qIndex, questions, mpSession, isPlayer1, gameStats, difficulty]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── ANSWER ───────────────────────────────────────────────────────────────────
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
        question: q.question_text, yourAnswer: "incorrect",
        correct: q.correct_answer, explanation: q.explanation
      }]
    };
    setGameStats(newStats);
    setVisitedCheckpoints(newVisited);
    setQIndex(prev => prev + 1);
    setActiveQuestion(null);

    // Sync checkpoints + XP in multiplayer
    if (mpSession) {
      const cpField = isPlayer1 ? "player1_checkpoints" : "player2_checkpoints";
      const xpField = isPlayer1 ? "player1_xp" : "player2_xp";
      base44.entities.MultiplayerSession.update(mpSession.id, {
        [cpField]: newVisited.size,
        [xpField]: newStats.xp
      }).catch(() => {});
    }

    if (!correct) {
      // Teleport player to a random non-finish cell
      let nr, nc;
      do {
        nr = Math.floor(Math.random() * ROWS);
        nc = Math.floor(Math.random() * COLS);
      } while (nr === ROWS - 1 && nc === COLS - 1);
      const newPlayerPos = { r: nr, c: nc };
      setPlayer(newPlayerPos);
      // Sync new position in multiplayer
      if (mpSession) {
        const field = isPlayer1 ? "player1_pos" : "player2_pos";
        base44.entities.MultiplayerSession.update(mpSession.id, { [field]: newPlayerPos }).catch(() => {});
      }
      // Always add an extra question and checkpoint so the minimum is reachable
      setQuestions(prev => {
        const randomQ = prev[Math.floor(Math.random() * prev.length)];
        return randomQ ? [...prev, { ...randomQ, _key: Date.now() }] : prev;
      });
      setCheckpoints(prev => {
        const newCp = findFreeCell(prev, newPlayerPos);
        return newCp ? [...prev, newCp] : prev;
      });
    }
  };

  // ── END GAME ─────────────────────────────────────────────────────────────────
  const endGame = async (finalStats = gameStats) => {
    if (!user) return;
    if (mpPollRef.current) clearInterval(mpPollRef.current);
    const time = Math.floor((Date.now() - startTime) / 1000);

    if (mpSession) {
      const finField = isPlayer1 ? "player1_finished" : "player2_finished";
      const xpField = isPlayer1 ? "player1_xp" : "player2_xp";

      // Fetch current session state
      const [sess] = await base44.entities.MultiplayerSession.filter({ id: mpSession.id });

      // If session already finished (opponent won), polling will handle the UI — just exit
      if (sess?.status === "finished") return;

      // Mark myself finished and save XP
      await base44.entities.MultiplayerSession.update(mpSession.id, {
        [finField]: true,
        [xpField]: finalStats.xp,
        status: "finished",
        winner_id: user.email  // I finished first — I win
      });

      // Award XP to winner
      if (profile) {
        const totalXP = finalStats.xp + (isPlayer1 ? (sess?.player2_xp || 0) : (sess?.player1_xp || 0));
        const newXP = (profile.xp || 0) + totalXP;
        await base44.entities.UserProfile.update(profile.id, {
          xp: newXP, level: Math.floor(newXP / 200) + 1,
          total_questions_answered: (profile.total_questions_answered || 0) + finalStats.total,
          total_correct: (profile.total_correct || 0) + finalStats.correct,
        });
        clearInterval(mpPollRef.current);
        setMpOver({ iWon: true, totalXP });
        setPhase("mpover");
      }
      return;
    }

    // Solo end game
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
  const canvasW = COLS * CELL_SIZE;
  const canvasH = ROWS * CELL_SIZE;

  // ── SETUP PHASE ──────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <MobileNav profile={null} />
          <h1 className="text-lg font-bold">Maze Quiz</h1>
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
                    <Users className="w-4 h-4" /> Challenge a Friend
                  </button>
                )}
              </div>
            )}
          </div>

          {showInvite && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-semibold mb-3">Select Friend to Challenge</h3>
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

  // ── MULTIPLAYER GAME OVER ─────────────────────────────────────────────────────
  if (phase === "mpover" && mpOver) {
    const iWon = mpOver.iWon;
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
        <div className="bg-[#13131f] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center text-white">
          <div className="text-5xl mb-4">{iWon ? "🏆" : "😔"}</div>
          <h2 className="text-2xl font-bold mb-2">{iWon ? "You Win!" : "You Lose"}</h2>
          <p className="text-white/50 text-sm mb-6">
            {iWon
              ? `You reached the finish first! You earn all XP: +${mpOver.totalXP} XP`
              : "Your opponent finished first. Better luck next time!"}
          </p>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-xl font-bold text-yellow-400">{iWon ? `+${mpOver.totalXP}` : "+0"} XP</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setPhase("setup"); setMpSession(null); setMpOver(null); setPlayMode(null); setOpponentWon(false); }} className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-semibold transition-colors">
              Play Again
            </button>
            <a href={createPageUrl("Dashboard")} className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors text-center">
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── SOLO GAME OVER ────────────────────────────────────────────────────────────
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

  // ── PLAYING ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onPointerDown={exitGame} className="text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-3 py-2 bg-white/10 rounded-xl touch-manipulation active:bg-white/20">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <h1 className="font-bold text-sm">Maze Quiz {mpSession && <span className="text-violet-400 ml-1">⚔ VS</span>}</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/50">
          {mpSession && (
            <span className="text-violet-300 font-semibold">Opp: {opponentCheckpoints} ✓ {opponentFinished ? "🏁" : ""}</span>
          )}
          <span>✅ {gameStats.correct}/{MIN_CORRECT[difficulty]}</span>
          <span>❌ {gameStats.incorrect}</span>
          <span>📍 {visitedCheckpoints.size}/{checkpoints.length}</span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-2 md:p-4" ref={gameRef} tabIndex={0} style={{ outline: "none" }}>
        <div className="relative mx-auto" style={{ width: canvasW, minWidth: canvasW }}>
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
              const x = cell.c * CELL_SIZE, y = cell.r * CELL_SIZE;
              const stroke = "rgba(99,102,241,0.4)", sw = 2;
              return (
                <g key={idx}>
                  {cell.walls[0] && <line x1={x} y1={y} x2={x + CELL_SIZE} y2={y} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[1] && <line x1={x + CELL_SIZE} y1={y} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[2] && <line x1={x} y1={y + CELL_SIZE} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                  {cell.walls[3] && <line x1={x} y1={y} x2={x} y2={y + CELL_SIZE} stroke={stroke} strokeWidth={sw} />}
                </g>
              );
            })}

            {/* Opponent (multiplayer) */}
            {mpSession && opponentPos && (
              <>
                <circle cx={opponentPos.c * CELL_SIZE + CELL_SIZE / 2} cy={opponentPos.r * CELL_SIZE + CELL_SIZE / 2} r={CELL_SIZE / 2 - 6} fill="rgba(239,68,68,0.7)" />
                <text x={opponentPos.c * CELL_SIZE + CELL_SIZE / 2} y={opponentPos.r * CELL_SIZE + CELL_SIZE / 2 + 5} textAnchor="middle" fontSize={14}>👹</text>
              </>
            )}

            {/* Player */}
            <circle cx={player.c * CELL_SIZE + CELL_SIZE / 2} cy={player.r * CELL_SIZE + CELL_SIZE / 2} r={CELL_SIZE / 2 - 6} fill="rgba(139,92,246,0.9)" />
            <text x={player.c * CELL_SIZE + CELL_SIZE / 2} y={player.r * CELL_SIZE + CELL_SIZE / 2 + 5} textAnchor="middle" fontSize={16}>🧙</text>
          </svg>

          <p className="text-center text-xs text-white/30 mt-2">
            {mpSession
              ? `🧙 You (purple) vs 👹 Opponent · Need ${MIN_CORRECT[difficulty]} correct answers to finish · Reach 🏁 first!`
              : `Use arrow keys · Reach ❓ to answer · Get ${MIN_CORRECT[difficulty]} correct answers then reach 🏁`}
          </p>
        </div>
      </div>

      {/* D-Pad */}
      <div className="flex flex-col items-center gap-1 p-4">
        <button onTouchStart={() => handleKeyDown({ key: "ArrowUp", preventDefault: () => {} })} className="w-12 h-12 bg-white/10 rounded-xl text-lg font-bold">↑</button>
        <div className="flex gap-1">
          {[["ArrowLeft", "←"], ["ArrowDown", "↓"], ["ArrowRight", "→"]].map(([k, l]) => (
            <button key={k} onTouchStart={() => handleKeyDown({ key: k, preventDefault: () => {} })} className="w-12 h-12 bg-white/10 rounded-xl text-lg font-bold">{l}</button>
          ))}
        </div>
      </div>

      {/* Opponent Won — notify loser with options */}
      {opponentWon && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13131f] border border-rose-500/30 rounded-2xl p-8 max-w-sm w-full text-center">
            <div className="text-6xl mb-4">😔</div>
            <h2 className="text-2xl font-bold mb-2 text-rose-400">You Lost!</h2>
            <p className="text-white/50 text-sm mb-6">Your opponent reached the finish line first. Better luck next time!</p>
            <div className="space-y-2">
              <button
                onClick={() => { setPhase("setup"); setMpSession(null); setMpOver(null); setPlayMode(null); setOpponentWon(false); }}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors"
              >
                🔄 Play Again / Rematch
              </button>
              <button
                onClick={() => setOpponentWon(false)}
                className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-semibold transition-colors"
              >
                👀 Continue Watching
              </button>
              <a
                href={createPageUrl("Dashboard")}
                className="block w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold transition-colors"
              >
                🏠 Exit Game
              </a>
            </div>
          </div>
        </div>
      )}

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