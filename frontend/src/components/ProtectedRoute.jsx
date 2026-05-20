import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, checking } = useAuth();
  if (checking || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-500 font-mono text-xs">
        <span className="animate-pulse">CARREGANDO…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
