import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Swords, Bomb, Layers } from "lucide-react";
import MobileNav from "@/components/layout/MobileNav";

const GAMES = [
  {
    id: "maze",
    name: "Maze Quiz",
    icon: <Swords className="w-8 h-8" />,
    desc: "Navigate through a maze and answer questions at each checkpoint to advance.",
    color: "from-violet-600 to-purple-700",
    glow: "shadow-violet-500/30",
    page: "MazeGame",
    emoji: "🧩"
  },
  {
    id: "bomb",
    name: "Bomb Grid",
    icon: <Bomb className="w-8 h-8" />,
    desc: "Minesweeper-style game where clicking a bomb triggers a study question.",
    color: "from-rose-600 to-red-700",
    glow: "shadow-rose-500/30",
    page: "BombGame",
    emoji: "💣"
  },
  {
    id: "blast",
    name: "Tetriquiz",
    icon: <Layers className="w-8 h-8" />,
    desc: "Clear Tetris lines and answer quiz questions to keep the game going.",
    color: "from-emerald-600 to-teal-700",
    glow: "shadow-emerald-500/30",
    page: "BlastGame",
    emoji: "🟩"
  }
];

export default function Games() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 px-4 md:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 bg-black/20 backdrop-blur-sm">
        <MobileNav profile={null} />
        <h1 className="text-lg font-bold">Games</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1">Choose a Game</h2>
          <p className="text-white/40 text-sm">Pick a game mode and select your study material to begin.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => navigate(createPageUrl(game.page))}
              className={`group relative bg-gradient-to-br ${game.color} p-[1px] rounded-2xl shadow-xl ${game.glow} hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 text-left`}
            >
              <div className="bg-[#0f0f17] rounded-2xl p-6 h-full flex flex-col">
                <div className="text-3xl mb-3">{game.emoji}</div>
                <h3 className="font-bold text-lg mb-2">{game.name}</h3>
                <p className="text-white/50 text-sm leading-relaxed flex-1">{game.desc}</p>
                <div className={`mt-5 text-xs font-semibold bg-gradient-to-r ${game.color} bg-clip-text text-transparent`}>
                  Play Now →
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}