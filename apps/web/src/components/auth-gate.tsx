"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { createContext, FormEvent, useContext, useEffect, useState } from "react";
import { getSession, login, logout, type SessionUser } from "@/lib/auth-api";
import { Icon } from "./icon";

type AuthContextValue = {
  user: SessionUser;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useWorkspaceAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useWorkspaceAuth harus digunakan di dalam AuthGate");
  return value;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSession()
      .then(setUser)
      .catch(() => setError("Layanan autentikasi belum dapat dijangkau."))
      .finally(() => setChecking(false));

    const handleExpiredSession = () => {
      queryClient.clear();
      setUser(null);
      setError("Sesi Anda telah berakhir. Silakan masuk kembali.");
    };
    const refreshInterval = window.setInterval(() => {
      void getSession().then((session) => {
        if (!session) handleExpiredSession();
      }).catch(handleExpiredSession);
    }, 45 * 60 * 1000);

    window.addEventListener("brin:session-expired", handleExpiredSession);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("brin:session-expired", handleExpiredSession);
    };
  }, [queryClient]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const sessionUser = await login(username.trim(), password);
      setPassword("");
      setPasswordVisible(false);
      setUser(sessionUser);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Tidak dapat masuk");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await logout().catch(() => undefined);
    queryClient.clear();
    setUser(null);
    setUsername("");
    setPassword("");
    setPasswordVisible(false);
  };

  if (checking) {
    return (
      <main className="auth-loading" aria-live="polite">
        <Image src="/brin-icon.png" width={64} height={64} alt="Logo BRIN" priority />
        <span className="auth-loading-line" />
        <strong>Memeriksa sesi aman…</strong>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-context" aria-label="Informasi sistem">
          <div className="login-brand">
            <Image src="/brin-icon.png" width={54} height={54} alt="Logo BRIN" priority />
            <div><strong>BRIN</strong><span>Badan Riset dan Inovasi Nasional</span></div>
          </div>
          <div className="login-context-copy">
            <p className="login-index">Sistem internal</p>
            <h1>Akses Perangkat Edge dalam sebuah Website</h1>
            <p>Pantau Jetson, kamera parkir, dan proses deteksi dari website yang terkontrol.</p>
          </div>
          <div className="login-system-line"><span><i /> Firebase Authentication</span><span>KST Samaun Samadikun</span></div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <form className="login-form" onSubmit={submit}>
            <div className="login-form-heading">
              <span className="login-lock"><Icon name="shield" /></span>
              <p className="eyebrow">Autentikasi workspace</p>
              <h2 id="login-title">Login</h2>
              <p>Gunakan akun operator yang terdaftar di Firebase.</p>
            </div>

            <label htmlFor="username">Nama pengguna</label>
            <div className="login-field"><Icon name="user" /><input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Masukkan nama pengguna" required autoFocus /></div>

            <label htmlFor="password">Kata sandi</label>
            <div className="login-field">
              <Icon name="lock" />
              <input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" spellCheck={false} required />
              <button
                className="password-toggle"
                type="button"
                aria-label={passwordVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                <Icon name={passwordVisible ? "eye-off" : "eye"} />
              </button>
            </div>

            {error && <div className="login-error" role="alert"><Icon name="x" /><span>{error}</span></div>}

            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? <Icon name="refresh" className="spinning" /> : <Icon name="arrow-right" />}
              {submitting ? "Memverifikasi…" : "Login"}
            </button>
            <p className="login-security"><Icon name="shield" /> Sesi dilindungi cookie HttpOnly. Kredensial tidak disimpan di browser.</p>
          </form>
        </section>
      </main>
    );
  }

  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}
