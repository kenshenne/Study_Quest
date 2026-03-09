import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";
import QuestionModal from "../components/game/QuestionModal";
import GameOverModal from "../components/game/GameOverModal";
import MaterialSelector from "../components/game/MaterialSelector";
import AchievementToast from "../components/achievements/AchievementToast";
import { checkAndAwardAchievements } from "../components/achievements/achievementsLib";

const COLS = 10;
const ROWS = 16;
const TICK_INTERVAL = 600; // ms between drops (fast)

const PIECES = [
  { shape: [[1, 1, 1, 1]], color: "#06b6d4" }, // I
  { shape: [[1, 1], [1, 1]], color: "#eab308" }, // O
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#8b5cf6" }, // T
  { shape: [[1, 0], [1, 0], [1, 1]], color: "#f97316" }, // L
  { shape: [[0, 1], [0, 1], [1, 1]], color: "#3b82f6" }, // J
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#22c55e" }, // S
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#ef4444" }, // Z
];

function randomPiece() {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)];
  return { shape: p.shape, color: p.color, x: Math.floor(COLS / 2) - 1, y: 0 };
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function canPlace(board, piece, dx = 0, dy = 0) {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nx = piece.x + c + dx;
      const ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

function placePiece(board, piece) {
  const next = board.map(row => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nx = piece.x + c;
      const ny = piece.y + r;
      if (ny >= 0) next[ny][nx] = piece.color;
    }
  }
  return next;
}

function clearLines(board) {
  const cleared = board.filter(row => row.some(cell => !cell));
  const clearedCount = ROWS - cleared.length;
  const newRows = Array.from({ length: clearedCount }, () => Array(COLS).fill(null));
  return { board: [...newRows, ...cleared], linesCleared: clearedCount };
}

export default function BlastGame() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("setup");
  const [materialId, setMaterialId] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [board, setBoard] = useState(emptyBoard());
  const [piece, setPiece] = useState(null);
  const [nextPiece, setNextPiece] = useState(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameStats, setGameStats] = useState({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [pendingBoard, setPendingBoard] = useState(null);
  const [locked, setLocked] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const tickRef = useRef(null);
  const boardRef = useRef(null);
  const pieceRef = useRef(null);
  const boardStateRef = useRef(null);
  const lockedRef = useRef(false);
  const activeQRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      base44.entities.UserProfile.filter({ user_id: u.email }).then(p => { if (p.length) setProfile(p[0]); });
    }).catch(() => base44.auth.redirectToLogin(createPageUrl("BlastGame")));
  }, []);

  const startGame = async (matId) => {
    const allQs = await base44.entities.Question.filter({ material_id: matId, user_id: user.email });
    if (!allQs.length) { alert("No questions found. Please upload study materials first."); return; }
    const diffQs = allQs.filter(q => q.difficulty === difficulty);
    const pool = diffQs.length >= 5 ? diffQs : allQs;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQuestions(shuffled);
    setQIndex(0);
    setBoard(emptyBoard());
    const p = randomPiece();
    const n = randomPiece();
    setPiece(p);
    setNextPiece(n);
    setScore(0);
    setLines(0);
    setLives(3);
    setGameStats({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
    setLocked(false);
    try {
      const s = await base44.entities.GameSession.create({
        user_id: user.email, username: profile?.username || user.email,
        game_type: "blast", difficulty, material_id: matId,
        score: 0, xp_earned: 0, total_questions: 0,
        correct_answers: 0, incorrect_answers: 0, completed: false
      });
      setSessionId(s.id);
    } catch {}
    setPhase("playing");
    setTimeout(() => boardRef.current?.focus(), 100);
  };

  // Keep refs in sync so the tick interval can read latest values without restarting
  useEffect(() => { pieceRef.current = piece; }, [piece]);
  useEffect(() => { boardStateRef.current = board; }, [board]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { activeQRef.current = activeQuestion; }, [activeQuestion]);

  // Single stable tick — never restarts, reads from refs
  useEffect(() => {
    if (phase !== "playing") return;
    tickRef.current = setInterval(() => {
      if (lockedRef.current || activeQRef.current) return;
      const p = pieceRef.current;
      const b = boardStateRef.current;
      if (!p || !b) return;
      if (canPlace(b, p, 0, 1)) {
        setPiece(prev => prev ? { ...prev, y: prev.y + 1 } : prev);
      } else {
        // Land piece — set locked immediately via ref to prevent double-land
        if (lockedRef.current) return;
        lockedRef.current = true;
        setLocked(true);
        const newBoard = placePiece(b, p);
        const { board: clearedBoard, linesCleared } = clearLines(newBoard);
        // Use functional state update to read latest questions/qIndex
        setQuestions(qs => {
          setQIndex(qi => {
            if (linesCleared > 0 && qs[qi]) {
              setPendingBoard(clearedBoard);
              setActiveQuestion(qs[qi]);
            } else {
              finalizeLandImmediate(clearedBoard, linesCleared, qs, qi);
            }
            return qi;
          });
          return qs;
        });
      }
    }, TICK_INTERVAL);
    return () => clearInterval(tickRef.current);
  }, [phase]); // Only depends on phase — never restarts due to piece/board changes

  const finalizeLandImmediate = (newBoard, linesCleared, qs, qi) => {
    setBoard(newBoard);
    setLines(prev => prev + linesCleared);
    setScore(prev => prev + linesCleared * 100);
    const newPiece = randomPiece();
    const afterNext = randomPiece();
    if (!canPlace(newBoard, { ...newPiece, x: Math.floor(COLS / 2) - 1, y: 0 })) {
      setPhase("over");
      return;
    }
    setPiece({ ...newPiece, x: Math.floor(COLS / 2) - 1, y: 0 });
    setNextPiece(afterNext);
    lockedRef.current = false;
    setLocked(false);
  };

  const movePiece = useCallback((dx, dy) => {
    if (lockedRef.current || activeQRef.current) return;
    const p = pieceRef.current;
    const b = boardStateRef.current;
    if (!p || !b) return;
    if (canPlace(b, p, dx, dy)) {
      setPiece(prev => prev ? { ...prev, x: prev.x + dx, y: prev.y + dy } : prev);
    }
    // Note: horizontal moves never land the piece — only the tick does that
  }, []);

  const rotatePiece = useCallback(() => {
    if (lockedRef.current || activeQRef.current) return;
    const p = pieceRef.current;
    const b = boardStateRef.current;
    if (!p || !b) return;
    const rotated = p.shape[0].map((_, i) => p.shape.map(row => row[i]).reverse());
    const rotatedPiece = { ...p, shape: rotated };
    if (canPlace(b, rotatedPiece)) {
      setPiece(rotatedPiece);
    }
  }, []);

  const hardDrop = useCallback(() => {
    if (lockedRef.current || activeQRef.current) return;
    const p = pieceRef.current;
    const b = boardStateRef.current;
    if (!p || !b) return;
    let dy = 0;
    while (canPlace(b, p, 0, dy + 1)) dy++;
    setPiece(prev => prev ? { ...prev, y: prev.y + dy } : prev);
  }, []);

  const landPiece = useCallback(() => {
    // This is kept for hardDrop usage only; tick uses the inline logic
    const p = pieceRef.current;
    const b = boardStateRef.current;
    if (!p || !b) return;
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    const newBoard = placePiece(b, p);
    const { board: clearedBoard, linesCleared } = clearLines(newBoard);
    setQuestions(qs => {
      setQIndex(qi => {
        if (linesCleared > 0 && qs[qi]) {
          setPendingBoard(clearedBoard);
          setActiveQuestion(qs[qi]);
        } else {
          finalizeLandImmediate(clearedBoard, linesCleared, qs, qi);
        }
        return qi;
      });
      return qs;
    });
  }, []);



  const handleAnswer = (correct) => {
    const q = activeQuestion;
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
    setQIndex(prev => prev + 1);
    setActiveQuestion(null);
    activeQRef.current = null;

    const newBoard = pendingBoard || boardStateRef.current;
    setPendingBoard(null);

    if (!correct) {
      if (difficulty === "hard") {
        endGame(newStats);
        return;
      } else if (difficulty === "medium") {
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) { endGame(newStats); return; }
      }
    }

    if (newStats.total >= questions.length) {
      endGame(newStats);
      return;
    }

    const linesCleared = pendingBoard ? 1 : 0;
    finalizeLandImmediate(newBoard, linesCleared, questions, qIndex + 1);
  };

  const endGame = async (finalStats = gameStats) => {
    clearInterval(tickRef.current);
    try {
      const sessionData = {
        score, xp_earned: finalStats.xp, total_questions: finalStats.total,
        correct_answers: finalStats.correct, incorrect_answers: finalStats.incorrect,
        completed: true, mistakes_review: finalStats.mistakes
      };
      if (sessionId) {
        await base44.entities.GameSession.update(sessionId, sessionData);
      } else {
        await base44.entities.GameSession.create({ user_id: user.email, username: profile?.username || user.email, game_type: "blast", difficulty, material_id: materialId, ...sessionData });
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
        const earned = await checkAndAwardAchievements(user.email, { ...updatedProfile, accuracy_rate: newTotal > 0 ? (newCorrect / newTotal) * 100 : 0 }, { ...finalStats, game_type: "blast" }, allSessions);
        if (earned.length > 0) setNewAchievements(earned);
      }
    } catch (e) { console.error(e); }
    setGameStats(finalStats);
    setPhase("over");
  };

  const handleKeyDown = useCallback((e) => {
    if (phase !== "playing" || activeQuestion || locked) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); movePiece(-1, 0); }
    else if (e.key === "ArrowRight") { e.preventDefault(); movePiece(1, 0); }
    else if (e.key === "ArrowDown") { e.preventDefault(); movePiece(0, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); rotatePiece(); }
    else if (e.key === " ") { e.preventDefault(); hardDrop(); }
  }, [phase, activeQuestion, locked, movePiece, rotatePiece, hardDrop]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <MobileNav profile={null} />
          <h1 className="text-lg font-bold">Block Blast</h1>
        </header>
        <main className="max-w-md mx-auto px-6 py-10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Game Setup</h2>
            {user && <MaterialSelector userId={user.email} onSelect={(id) => { setMaterialId(id); startGame(id); }} difficulty={difficulty} onDifficultyChange={setDifficulty} />}
          </div>
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-xs text-white/50 space-y-1">
            <p>⬅️➡️ Arrow keys to move · ⬆️ Rotate · ⬇️ Drop · Space = Hard drop</p>
            <p>Clearing a line triggers a quiz question!</p>
            {difficulty === "hard" && <p className="text-rose-400">Hard mode: Wrong answer = Game Over!</p>}
          </div>
        </main>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <>
        <GameOverModal stats={gameStats} onRestart={() => { setSessionId(null); setPhase("setup"); }} gameType="blast" />
        {newAchievements.map((a, i) => (
          <AchievementToast key={a.id || i} achievement={a} onDone={() => setNewAchievements(prev => prev.slice(1))} />
        ))}
      </>
    );
  }

  // Render board with current piece overlay
  const displayBoard = board.map(row => [...row]);
  if (piece) {
    // Ghost piece
    let ghostY = piece.y;
    while (canPlace(board, piece, 0, ghostY - piece.y + 1)) ghostY++;
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const nx = piece.x + c;
        const ny = ghostY + r;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && !displayBoard[ny][nx]) {
          displayBoard[ny][nx] = piece.color + "40";
        }
      }
    }
    // Active piece
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const nx = piece.x + c;
        const ny = piece.y + r;
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          displayBoard[ny][nx] = piece.color;
        }
      }
    }
  }

  const CELL = 32;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col" ref={boardRef} tabIndex={0} style={{ outline: "none" }}>
      <header className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onPointerDown={() => endGame()} className="text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-3 py-2 bg-white/10 rounded-xl touch-manipulation active:bg-white/20">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <span className="font-bold text-sm">Block Blast</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/50">
          <span>❤️ {lives}</span>
          <span>Score: {score}</span>
          <span>✅ {gameStats.correct}</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center gap-6 p-4">
        {/* Board */}
        <div
          className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
          style={{ width: COLS * CELL, height: ROWS * CELL }}
        >
          {displayBoard.map((row, ri) => (
            <div key={ri} className="flex">
              {row.map((cell, ci) => (
                <div
                  key={ci}
                  style={{
                    width: CELL,
                    height: CELL,
                    backgroundColor: cell || "transparent",
                    border: cell ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.03)"
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4 min-w-[100px]">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Score</p>
            <p className="font-bold">{score}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Lines</p>
            <p className="font-bold">{lines}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Lives</p>
            <p className="font-bold">{"❤️".repeat(Math.max(0, lives))}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-xs text-white/40 mb-2">Next</p>
            {nextPiece && (
              <div className="flex flex-col items-center gap-0.5">
                {nextPiece.shape.map((row, ri) => (
                  <div key={ri} className="flex gap-0.5">
                    {row.map((cell, ci) => (
                      <div key={ci} style={{ width: 10, height: 10, backgroundColor: cell ? nextPiece.color : "transparent", borderRadius: 2 }} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-1 p-3 md:hidden md:flex">
        <button onTouchStart={rotatePiece} className="w-12 h-12 bg-white/10 rounded-xl text-lg">↑</button>
        <div className="flex gap-1">
          <button onTouchStart={() => movePiece(-1, 0)} className="w-12 h-12 bg-white/10 rounded-xl text-lg">←</button>
          <button onTouchStart={() => movePiece(0, 1)} className="w-12 h-12 bg-white/10 rounded-xl text-lg">↓</button>
          <button onTouchStart={() => movePiece(1, 0)} className="w-12 h-12 bg-white/10 rounded-xl text-lg">→</button>
        </div>
        <button onTouchStart={hardDrop} className="w-28 h-10 bg-violet-600 rounded-xl text-sm font-bold">Drop</button>
      </div>

      {activeQuestion && (
        <QuestionModal
          question={activeQuestion}
          onAnswer={handleAnswer}
          onClose={() => { setPendingBoard(null); setActiveQuestion(null); setLocked(false); }}
          showHint={difficulty === "easy"}
        />
      )}
    </div>
  );
}