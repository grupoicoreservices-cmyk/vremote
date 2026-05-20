import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MonitorSmartphone,
  Activity,
  Users,
  BookUser,
  ScrollText,
  KeyRound,
  Settings,
  Terminal,
  LogOut,
  Download,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/devices", label: "Dispositivos", icon: MonitorSmartphone, testid: "nav-devices" },
  { to: "/sessions", label: "Sessões", icon: Activity, testid: "nav-sessions" },
  { to: "/address-book", label: "Address Book", icon: BookUser, testid: "nav-address-book" },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, testid: "nav-audit-logs" },
  { to: "/users", label: "Usuários", icon: Users, adminOnly: true, testid: "nav-users" },
  { to: "/access-tokens", label: "Tokens", icon: KeyRound, adminOnly: true, testid: "nav-access-tokens" },
  { to: "/agent", label: "Agente", icon: Download, testid: "nav-agent" },
  { to: "/settings", label: "Configurações", icon: Settings, testid: "nav-settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-64 shrink-0 bg-neutral-950 border-r border-neutral-900 flex flex-col" data-testid="sidebar">
      <div className="px-5 pt-6 pb-5 border-b border-neutral-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500/10 border border-green-500/40 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">RustAdmin</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Remote Control v1.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <div className="label-eyebrow px-3 mb-2">Navegação</div>
        {NAV.filter((n) => !n.adminOnly || user?.role === "admin").map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testid}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2 text-sm border-l-2 transition-colors duration-150 ${
                  isActive
                    ? "border-green-500 bg-neutral-900 text-neutral-50"
                    : "border-transparent text-neutral-400 hover:text-neutral-50 hover:bg-neutral-900/50"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-neutral-900">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{user?.name || user?.email}</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-btn"
            className="p-2 hover:bg-neutral-900 text-neutral-400 hover:text-amber-500 transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
