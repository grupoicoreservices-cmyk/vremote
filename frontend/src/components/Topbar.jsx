import { Search, Command, Circle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Topbar({ title, subtitle, actions }) {
  const { user } = useAuth();
  return (
    <header className="h-16 border-b border-neutral-900 bg-neutral-950/60 backdrop-blur-sm px-6 flex items-center justify-between" data-testid="topbar">
      <div>
        {title && <h1 className="text-xl tracking-tight font-medium" data-testid="page-title">{title}</h1>}
        {subtitle && <p className="text-xs text-neutral-500 font-mono mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-neutral-800 bg-neutral-900/60 text-neutral-500 text-xs font-mono">
          <Search className="w-3.5 h-3.5" />
          <span>Buscar dispositivo…</span>
          <span className="ml-2 flex items-center gap-1 text-[10px] border border-neutral-800 px-1 py-0.5">
            <Command className="w-3 h-3" /> K
          </span>
        </div>
        {actions}
        <div className="flex items-center gap-2 px-3 py-1.5 border border-neutral-800">
          <Circle className="w-2 h-2 fill-green-500 text-green-500" />
          <span className="text-xs font-mono text-neutral-300">{user?.email}</span>
        </div>
      </div>
    </header>
  );
}
