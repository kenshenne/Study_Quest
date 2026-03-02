import { useEffect } from "react";

export default function Layout({ children, currentPageName }) {
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