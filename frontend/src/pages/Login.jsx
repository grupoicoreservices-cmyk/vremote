import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const BG = "https://static.prod-images.emergentagent.com/jobs/539a4407-7ab7-4ef7-aae7-fc6df8facf83/images/7b2a7aca4c56fb6410a6cda88e8da4092eb2c67c535b41ed930cc95ba6cd83ae.png";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@vremote.io");
  const [password, setPassword] = useState("Admin@2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return;
    }
    toast.success("Acesso autorizado");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-neutral-950 text-neutral-100">
      {/* Left visual side */}
      <div className="hidden lg:flex relative w-1/2 overflow-hidden border-r border-neutral-900">
        <img src={BG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-black/80" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 border border-green-500/50 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">V-remote</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Remote Control Panel</div>
            </div>
          </div>

          <div className="space-y-6 max-w-md">
            <div className="label-eyebrow text-green-500">// Console de Administração</div>
            <h2 className="text-4xl tracking-tight font-medium leading-tight">
              Controle remoto, monitorado e auditado em um só painel.
            </h2>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Gerencie dispositivos, sessões e operadores em tempo real. Inspirado no RustDesk Server Pro,
              construído para times de TI que valorizam clareza e segurança.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-green-500" /> JWT + bcrypt + httpOnly cookies
            </div>
          </div>

          <div className="font-mono text-[10px] tracking-widest text-neutral-500">
            BUILD 2026.02 · NODE-EDGE-01 · ALL SYSTEMS NOMINAL
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="label-eyebrow mb-3">Entrar</div>
          <h1 className="text-3xl tracking-tight font-medium">Acesse o painel</h1>
          <p className="text-sm text-neutral-400 mt-2 mb-8">
            Use suas credenciais de administrador para continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="label-eyebrow">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-neutral-900/60 border-neutral-800 font-mono focus-visible:ring-green-500 focus-visible:ring-1"
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="label-eyebrow">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-neutral-900/60 border-neutral-800 font-mono focus-visible:ring-green-500 focus-visible:ring-1"
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <div className="text-xs font-mono text-amber-500 border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid="login-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-green-500 hover:bg-green-400 text-black font-medium rounded-sm h-11 group"
              data-testid="login-submit-button"
            >
              {loading ? "AUTENTICANDO…" : (<><span>Autenticar</span><ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>)}
            </Button>
            <div className="text-[10px] font-mono text-neutral-500 text-center pt-2">
              Demo · admin@vremote.io · Admin@2026
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
