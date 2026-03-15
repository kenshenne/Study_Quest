import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Flag } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";
import QuestionModal from "../components/game/QuestionModal";
import GameOverModal from "../components/game/GameOverModal";
import MaterialSelector from "../components/game/MaterialSelector";
import AchievementToast from "../components/achievements/AchievementToast";
import { checkAndAwardAchievements } from "../components/achievements/achievementsLib";

function generateGrid(cols, rows, bombCount) {
  const total = cols * rows;
  const bombSet = new Set();
  while (bombSet.size < Math.min(bombCount, total - 1)) {
    bombSet.add(Math.floor(Math.random() * total));
  }
  const cells = Array.from({ length: total }, (_, i) => ({
    index: i,
    row: Math.floor(i / cols),
    col: i % cols,
    isBomb: bombSet.has(i),
    revealed: false,
    flagged: false,
    adjacentBombs: 0
  }));
  // Calculate adjacent bombs
  cells.forEach(cell => {
    if (!cell.isBomb) {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cell.row + dr;
          const nc = cell.col + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (cells[nr * cols + nc].isBomb) count++;
          }
        }
      }
      cell.adjacentBombs = count;
    }
  });
  return cells;
}

// Grid sizes by difficulty: easy=6×6, medium=8×8, hard=10×10
const DIFFICULTY_GRID = {
  easy:   { cols: 6, rows: 6, bombs: 5 },
  medium: { cols: 8, rows: 8, bombs: 12 },
  hard:   { cols: 10, rows: 10, bombs: 20 }
};

export default function BombGame() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("setup");
  const [materialId, setMaterialId] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [usedQuestions, setUsedQuestions] = useState([]);
  const [grid, setGrid] = useState([]);
  const [levelConfig, setLevelConfig] = useState({ cols: 8, rows: 8, bombs: 12 });
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [pendingCell, setPendingCell] = useState(null);
  const [isDoubleXP, setIsDoubleXP] = useState(false);
  const [gameStats, setGameStats] = useState({ correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] });
  const [revealedCount, setRevealedCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [newAchievements, setNewAchievements] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      base44.entities.UserProfile.filter({ user_id: u.email }).then(p => { if (p.length) setProfile(p[0]); });
    }).catch(() => base44.auth.redirectToLogin(createPageUrl("BombGame")));
  }, []);

  const startGame = async (matId) => {
    const allQs = await base44.entities.Question.filter({ material_id: matId, user_id: user.email });
    if (!allQs.length) { alert("No questions found. Please upload study materials first."); return; }
    const diffQs = allQs.filter(q => q.difficulty === difficulty);
    const basePool = diffQs.length >= 5 ? diffQs : allQs;
    const cfg = DIFFICULTY_GRID[difficulty];
    const needed = cfg.bombs + 5; // ensure more than enough questions
    // Pad pool by recycling if needed
    let pool = [...basePool].sort(() => Math.random() - 0.5);
    while (pool.length < needed) {
      pool = [...pool, ...[...basePool].sort(() => Math.random() - 0.5)];
    }
    setQuestions(pool);
    setUsedQuestions([]);
    setupLevel(pool, [], difficulty);
    const stats = { correct: 0, incorrect: 0, total: 0, xp: 0, mistakes: [] };
    setGameStats(stats);
    try {
      const s = await base44.entities.GameSession.create({
        user_id: user.email,
        username: profile?.username || user.email,
        game_type: "bomb",
        difficulty,
        material_id: matId,
        score: 0, xp_earned: 0, total_questions: 0,
        correct_answers: 0, incorrect_answers: 0,
        completed: false, level_reached: 1
      });
      setSessionId(s.id);
    } catch {}
    setPhase("playing");
  };

  const setupLevel = (allQs, used, diff) => {
    const cfg = DIFFICULTY_GRID[diff || difficulty];
    setLevelConfig(cfg);
    setGrid(generateGrid(cfg.cols, cfg.rows, cfg.bombs));
    setRevealedCount(0);
    setFlagCount(0);
  };

  const getNextQuestion = (used) => {
    // First try unused questions
    const available = questions.filter(q => !used.includes(q.id));
    if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
    // All used — recycle from full pool (avoid immediate repeat if possible)
    const lastUsed = used[used.length - 1];
    const recycled = questions.filter(q => q.id !== lastUsed);
    const fallback = recycled.length > 0 ? recycled : questions;
    return fallback[Math.floor(Math.random() * fallback.length)];
  };

  const handleCellClick = (cell, e) => {
    e.preventDefault();
    if (phase !== "playing" || activeQuestion) return;
    if (cell.revealed || cell.flagged) return;

    if (cell.isBomb) {
      // Bomb triggered - normal XP question
      const q = getNextQuestion(usedQuestions);
      setPendingCell({ ...cell, action: "bomb" });
      setIsDoubleXP(false);
      setActiveQuestion(q);
    } else {
      // Reveal safe cell
      revealCell(cell.index);
      setTimeout(() => checkLevelComplete(), 100);
    }
  };

  const handleCellRightClick = (cell, e) => {
    e.preventDefault();
    if (phase !== "playing" || activeQuestion) return;
    if (cell.revealed) return;

    if (!cell.flagged) {
      // Place flag
      if (cell.isBomb) {
        // Correct bomb flagged = double XP
        setPendingCell({ ...cell, action: "flag_correct" });
        const q = getNextQuestion(usedQuestions);
        if (!q) { checkLevelComplete(); return; }
        setIsDoubleXP(true);
        setActiveQuestion(q);
      } else {
        // Flag on safe cell - just toggle
        toggleFlag(cell.index);
      }
    } else {
      toggleFlag(cell.index);
    }
  };

  const toggleFlag = (idx) => {
    setGrid(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], flagged: !next[idx].flagged };
      return next;
    });
    setFlagCount(prev => grid[idx].flagged ? prev - 1 : prev + 1);
  };

  const revealCell = (idx) => {
    setGrid(prev => {
      const next = [...prev];
      if (next[idx].revealed || next[idx].flagged || next[idx].isBomb) return prev;
      next[idx] = { ...next[idx], revealed: true };
      // Auto-reveal adjacent if 0 bombs nearby
      if (next[idx].adjacentBombs === 0) {
        const { row, col } = next[idx];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < levelConfig.rows && nc >= 0 && nc < levelConfig.cols) {
              const ni = nr * levelConfig.cols + nc;
              if (!next[ni].revealed && !next[ni].isBomb) {
                next[ni] = { ...next[ni], revealed: true };
              }
            }
          }
        }
      }
      return next;
    });
    setRevealedCount(prev => prev + 1);
  };

  const checkLevelComplete = (currentGrid, currentUsed) => {
    const g = currentGrid || grid;
    const safeCells = g.filter(c => !c.isBomb).length;
    const revealed = g.filter(c => c.revealed && !c.isBomb).length;
    const flaggedBombs = g.filter(c => c.isBomb && c.flagged).length;
    const totalBombs = g.filter(c => c.isBomb).length;
    const allSafeRevealed = revealed >= safeCells;
    const allBombsFlagged = flaggedBombs >= totalBombs;

    if (allSafeRevealed || allBombsFlagged) {
      setTimeout(() => endGame(), 500);
    }
  };

  const handleAnswer = (correct) => {
    const q = activeQuestion;
    const newUsed = [...usedQuestions, q.id];
    setUsedQuestions(newUsed);

    const xpGain = correct ? (isDoubleXP ? (difficulty === "easy" ? 20 : difficulty === "medium" ? 40 : 60) : (difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30)) : 0;
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

    if (pendingCell) {
      if (pendingCell.action === "bomb") {
        // Reveal the bomb cell visually regardless of correct/incorrect
        setGrid(prev => {
          const next = [...prev];
          next[pendingCell.index] = { ...next[pendingCell.index], revealed: true };
          return next;
        });
      } else if (pendingCell.action === "flag_correct" && correct) {
        toggleFlag(pendingCell.index);
      }
    }

    setPendingCell(null);
    setActiveQuestion(null);

    setTimeout(() => checkLevelComplete(null, newUsed), 300);
  };

  const endGame = async (finalStats = gameStats) => {
    try {
      const sessionData = {
        score: finalStats.correct * (difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30),
        xp_earned: finalStats.xp,
        total_questions: finalStats.total,
        correct_answers: finalStats.correct,
        incorrect_answers: finalStats.incorrect,
        completed: true,
        mistakes_review: finalStats.mistakes,
        level_reached: 1
      };
      if (sessionId) {
        await base44.entities.GameSession.update(sessionId, sessionData);
      } else {
        await base44.entities.GameSession.create({ user_id: user.email, username: profile?.username || user.email, game_type: "bomb", difficulty, material_id: materialId, ...sessionData });
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
        const earned = await checkAndAwardAchievements(user.email, { ...updatedProfile, accuracy_rate: newTotal > 0 ? (newCorrect / newTotal) * 100 : 0 }, { ...finalStats, game_type: "bomb" }, allSessions);
        if (earned.length > 0) setNewAchievements(earned);
      }
    } catch (e) { console.error(e); }
    setGameStats(finalStats);
    setPhase("over");
  };

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <MobileNav profile={null} />
          <h1 className="text-lg font-bold">Bomb Grid</h1>
        </header>
        <main className="max-w-md mx-auto px-6 py-10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Game Setup</h2>
            {user && <MaterialSelector userId={user.email} onSelect={(id) => { setMaterialId(id); startGame(id); }} difficulty={difficulty} onDifficultyChange={setDifficulty} />}
          </div>
          <div className="mt-4 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-xs text-white/50 space-y-1">
            <p>🖱️ <strong>Left click</strong> to reveal a cell</p>
            <p>🚩 <strong>Right click</strong> to flag a bomb (Correct = 2× XP!)</p>
            <p>💣 Clicking a bomb triggers a quiz question</p>
          </div>
        </main>
      </div>
    );
  }

  if (phase === "over") {
    const won = gameStats.total > 0;
    return (
      <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl text-white">
            <div className="p-6 text-center border-b border-white/5">
              <div className="text-6xl mb-4">{won ? "🏆" : "💣"}</div>
              <h2 className="text-2xl font-bold mb-1">{won ? "Excellent! You won the game!" : "Better luck next time! You lost the game."}</h2>
              <p className="text-white/40 text-sm mt-2">Bomb Grid · {difficulty}</p>
            </div>
            <div className="p-6 grid grid-cols-3 gap-3 text-center border-b border-white/5">
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-2xl font-bold text-emerald-400">{gameStats.correct}</div>
                <div className="text-xs text-white/40 mt-1">Correct</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-2xl font-bold text-rose-400">{gameStats.incorrect}</div>
                <div className="text-xs text-white/40 mt-1">Incorrect</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-2xl font-bold text-violet-400">+{gameStats.xp}</div>
                <div className="text-xs text-white/40 mt-1">XP</div>
              </div>
            </div>
            <div className="p-5 flex gap-3">
              <button
                onClick={() => { setSessionId(null); setPhase("setup"); }}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-semibold transition-colors"
              >
                🔄 Play Again
              </button>
              <a
                href={createPageUrl("Dashboard")}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors text-center"
              >
                🏠 Exit Game
              </a>
            </div>
          </div>
        </div>
        {newAchievements.map((a, i) => (
          <AchievementToast key={a.id || i} achievement={a} onDone={() => setNewAchievements(prev => prev.slice(1))} />
        ))}
      </>
    );
  }

  const bombsLeft = grid.filter(c => c.isBomb && !c.flagged).length;
  const colorMap = { 1: "#3b82f6", 2: "#22c55e", 3: "#ef4444", 4: "#7c3aed", 5: "#f97316", 6: "#06b6d4", 7: "#ec4899", 8: "#94a3b8" };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onPointerDown={() => endGame()} className="text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-3 py-2 bg-white/10 rounded-xl touch-manipulation active:bg-white/20">
            <ArrowLeft className="w-4 h-4" /> Exit
          </button>
          <span className="font-bold text-sm">Bomb Grid</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-rose-400" />{bombsLeft}</span>
          <span>✅ {gameStats.correct}</span>
          <span>❌ {gameStats.incorrect}</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div>
          <div
            className="inline-grid gap-0.5 p-2 bg-white/5 rounded-xl border border-white/10"
            style={{ gridTemplateColumns: `repeat(${levelConfig.cols}, 1fr)` }}
          >
            {grid.map((cell) => (
              <button
                key={cell.index}
                onClick={(e) => handleCellClick(cell, e)}
                onContextMenu={(e) => handleCellRightClick(cell, e)}
                className={`w-8 h-8 text-xs font-bold flex items-center justify-center rounded transition-all select-none ${
                  cell.revealed
                    ? cell.isBomb
                      ? "bg-rose-500/30 text-rose-300"
                      : "bg-white/10 text-white"
                    : cell.flagged
                    ? "bg-amber-500/20 border border-amber-500/50"
                    : "bg-white/8 hover:bg-white/15 border border-white/10 cursor-pointer active:scale-95"
                }`}
              >
                {cell.revealed && !cell.isBomb && cell.adjacentBombs > 0 && (
                  <span style={{ color: colorMap[cell.adjacentBombs] }}>{cell.adjacentBombs}</span>
                )}
                {cell.revealed && cell.isBomb && "💣"}
                {!cell.revealed && cell.flagged && "🚩"}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-white/30 mt-2">Right-click to flag bombs · Left-click to reveal</p>
        </div>
      </div>

      {activeQuestion && (
        <QuestionModal
          question={activeQuestion}
          onAnswer={handleAnswer}
          onClose={() => { setPendingCell(null); setActiveQuestion(null); }}
          showHint={difficulty !== "hard"}
          doubleXP={isDoubleXP}
        />
      )}
    </div>
  );
}