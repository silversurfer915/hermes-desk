import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLive } from "@/state/live";

const Input = (props) => (
  <input {...props} className="glass-inset min-h-11 w-full rounded-xl px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
);

export const LoginForm = ({ conn }) => {
  const { login } = useLive();
  const pw = (conn.providers || []).filter((p) => p.supports_password);
  const [method, setMethod] = useState(pw.length ? "password" : "token");
  const [provider, setProvider] = useState(pw[0]?.name || "");
  const [username, setUsername] = useState(() => localStorage.getItem("hermes-username") || "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!pw.length && !conn.token_login) {
    return (
      <p data-testid="login-unsupported" className="text-[12px] text-slate-600">
        Your Hermes only offers browser sign-in ({(conn.providers || []).map((p) => p.display_name).join(", ") || "OAuth"}), which can't complete from a remote app yet. Turn on Hermes' password login or its session-token login, then reload.
      </p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await login(method === "password" ? { method, provider, username, password: secret } : { method, token: secret });
      if (method === "password") localStorage.setItem("hermes-username", username);
      setSecret("");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form data-testid="hermes-login-form" onSubmit={submit} className="space-y-2.5">
      {pw.length > 1 && method === "password" && (
        <select data-testid="login-provider-select" value={provider} onChange={(e) => setProvider(e.target.value)} className="glass-inset min-h-11 w-full rounded-xl px-3 py-2 text-[13px]">
          {pw.map((p) => <option key={p.name} value={p.name}>{p.display_name}</option>)}
        </select>
      )}
      {method === "password" && <Input data-testid="login-username-input" autoComplete="username" placeholder="Hermes username" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Hermes username" />}
      <Input data-testid="login-secret-input" type="password" autoComplete={method === "password" ? "current-password" : "off"} placeholder={method === "password" ? "Password" : "Session token"} value={secret} onChange={(e) => setSecret(e.target.value)} aria-label={method === "password" ? "Password" : "Session token"} />
      {error && <p data-testid="login-error" role="alert" className="text-[12px] text-red-700">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {pw.length > 0 && conn.token_login ? (
          <button type="button" data-testid="login-method-toggle" onClick={() => { setMethod(method === "password" ? "token" : "password"); setSecret(""); setError(""); }} className="text-[12px] font-medium text-blue-700 hover:underline">
            {method === "password" ? "Use a session token instead" : "Use username & password"}
          </button>
        ) : <span />}
        <button data-testid="login-submit-button" disabled={busy || !secret || (method === "password" && !username)} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy && <Loader2 size={13} className="animate-spin" />} Sign in to Hermes
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Hermes checks these details. They're passed straight through and never stored. This app only keeps an encrypted Hermes session on its server.</p>
    </form>
  );
};
