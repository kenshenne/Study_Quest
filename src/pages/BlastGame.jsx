import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import QuestionModal from "../components/game/QuestionModal";
import GameOverModal from "../components/game/GameOverModal";
import MaterialSelector from "../components/game/MaterialSelector";

const COLS = 8;
const ROWS = 14;
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
  const tickRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      base44.entities.UserProfile.filter({ user_id: u.email }).then(p => { if (p.length) setProfile(p[0]); });
    }).catch(() => base44.auth.redirectToLogin(createPageUrl("BlastGame")));
  }, []);

  const startGame = async (matId) => {
    const qs = await base44.entities.Question.filter({ material_id: matId, user_id: user.email, difficulty });
    if (!qs.length) { alert("No questions found. Please upload study materials first."); return; }
    const shuffled = [...qs].sort(() => Math.random() - 0.5);
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
    setPhase("playing");
    setTimeout(() => boardRef.current?.focus(), 100);
  };

  // Tick
  useEffect(() => {
    if (phase !== "playing" || activeQuestion || locked) return;
    tickRef.current = setInterval(() => {
      movePiece(0, 1);
    }, TICK_INTERVAL);
    return () => clearInterval(tickRef.current);
  }, [phase, piece, board, activeQuestion, locked]);

  const movePiece = useCallback((dx, dy) => {
    if (!piece || activeQuestion || locked) return;
    if (canPlace(board, piece, dx, dy)) {
      setPiece(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (dy > 0) {
      // Land piece
      landPiece();
    }
  }, [piece, board, activeQuestion, locked]);

  const rotatePiece = useCallback(() => {
    if (!piece || activeQuestion || locked) return;
    const rotated = piece.shape[0].map((_, i) => piece.shape.map(row => row[i]).reverse());
    const rotatedPiece = { ...piece, shape: rotated };
    if (canPlace(board, rotatedPiece)) {
      setPiece(rotatedPiece);
    }
  }, [piece, board, activeQuestion, locked]);

  const hardDrop = useCallback(() => {
    if (!piece || activeQuestion || locked) return;
    let dy = 0;
    while (canPlace(board, piece, 0, dy + 1)) dy++;
    if (dy > 0) {
      setPiece(prev => ({ ...prev, y: prev.y + dy }));
      setTimeout(() => landPiece(), 50);
    } else {
      landPiece();
    }
  }, [piece, board, activeQuestion, locked]);

  const landPiece = useCallback(() => {
    if (!piece) return;
    setLocked(true);
    const newBoard = placePiece(board, piece);
    const { board: clearedBoard, linesCleared } = clearLines(newBoard);

    if (linesCleared > 0) {
      // Trigger question for cleared lines
      const q = questions[qIndex];
      if (q) {
        setPendingBoard(clearedBoard);
        setActiveQuestion(q);
        return;
      }
      finalizeLand(clearedBoard, linesCleared);
    } else {
      finalizeLand(clearedBoard, 0);
    }
  }, [piece, board, questions, qIndex]);

  const finalizeLand = (newBoard, linesCleared) => {
    setBoard(newBoard);
    setLines(prev => prev + linesCleared);
    setScore(prev => prev + linesCleared * 100);
    const newPiece = nextPiece || randomPiece();
    const afterNext = randomPiece();
    // Check game over
    if (!canPlace(newBoard, { ...newPiece, x: Math.floor(COLS / 2) - 1, y: 0 })) {
      endGame();
      return;
    }
    setPiece({ ...newPiece, x: Math.floor(COLS / 2) - 1, y: 0 });
    setNextPiece(afterNext);
    setLocked(false);
  };

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

    const newBoard = pendingBoard || board;
    setPendingBoard(null);

    if (!correct) {
      if (difficulty === "hard") {
        // Instant game over
        endGame(newStats);
        return;
      } else if (difficulty === "medium") {
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) { endGame(newStats); return; }
      }
      // easy: retry already handled (just continue)
    }

    if (newStats.total >= questions.length) {
      endGame(newStats);
      return;
    }

    const linesCleared = newBoard !== board ? 1 : 0;
    finalizeLand(newBoard, linesCleared);
  };

  const endGame = async (finalStats = gameStats) => {
    clearInterval(tickRef.current);
    try {
      await base44.entities.GameSession.create({
        user_id: user.email,
        username: profile?.username || user.email,
        game_type: "blast",
        difficulty,
        material_id: materialId,
        score: score,
        xp_earned: finalStats.xp,
        total_questions: finalStats.total,
        correct_answers: finalStats.correct,
        incorrect_answers: finalStats.incorrect,
        completed: true,
        mistakes_review: finalStats.mistakes
      });
      if (profile) {
        const newXP = (profile.xp || 0) + finalStats.xp;
        const newTotal = (profile.total_questions_answered || 0) + finalStats.total;
        const newCorrect = (profile.total_correct || 0) + finalStats.correct;
        await base44.entities.UserProfile.update(profile.id, {
          xp: newXP,
          level: Math.floor(newXP / 200) + 1,
          total_questions_answered: newTotal,
          total_correct: newCorrect,
          accuracy_rate: newTotal > 0 ? (newCorrect / newTotal) * 100 : 0
        });
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
        <header className="border-b border-white/5 px-6 py-4 flex items-center gap-4">
          <Link to={createPageUrl("Dashboard")} className="text-white/40 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-xl font-bold">Block Blast</h1>
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
    return <GameOverModal stats={gameStats} onRestart={() => setPhase("setup")} gameType="blast" />;
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
          <button onClick={() => endGame()} className="text-white/40 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
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

      {/* Mobile Controls */}
      <div className="flex flex-col items-center gap-1 p-3 md:hidden">
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