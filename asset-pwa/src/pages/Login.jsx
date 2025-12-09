// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import errorText from "../ui/errorText";

export default function Login({ onLoggedIn }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const navigate = useNavigate();

  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await login(form.username.trim(), form.password);
      localStorage.setItem("av_token", token);
      sessionStorage.setItem("av_token", token);
      localStorage.setItem("av_login", String(Date.now()));
      onLoggedIn?.();
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorText(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap page-in">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-head">
          <div className="logo">💼</div>
          <h1>AssetVault</h1>
          <p className="muted">Sign in to manage assets</p>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="field">
          <label>Username</label>
          <input
            autoFocus
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            placeholder="your.username"
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label>Password</label>
          <div className="pw-wrap">
            <input
              type={showPwd ? "text" : "password"}
              className="pw-input"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPwd((s) => !s)}
              aria-label={showPwd ? "Hide password" : "Show password"}
              title={showPwd ? "Hide" : "Show"}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                {showPwd ? (
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a3 3 0 004.24 4.24" />
                    <path d="M17.94 17.94C15.9 19 13.54 19.5 12 19.5 6.5 19.5 3 12 3 12c.66-1.24 1.61-2.61 2.87-3.86" />
                  </g>
                ) : (
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s3.5-7.5 11-7.5 11 7.5 11 7.5-3.5 7.5-11 7.5S1 12 1 12Z" />
                    <circle cx="12" cy="12" r="3.5" />
                  </g>
                )}
              </svg>
            </button>
          </div>
        </div>

        <button className={`btn primary full ${busy ? "loading" : ""}`} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
