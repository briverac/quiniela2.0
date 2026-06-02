import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../api";
import landingBg from "../images/landing.jpg";

type Me = { user: { id: number } | null };

export default function Login() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  useEffect(() => {
    apiJson<Me>("/api/me").then((m) => {
      if (m.user) nav("/predictions", { replace: true });
    });
  }, [nav]);
  const err = sp.get("error");
  return (
    <div className="login-layout">
      <img src={landingBg} alt="" className="login-layout__bg" />
      <div className="login-layout__overlay" aria-hidden="true" />
      <header className="login-header">
        <h1 className="login-title">Quiniela</h1>
        <p className="login-tagline">World Cup 2026 prediction game</p>
      </header>
      <div className="login-actions">
        {err && <p className="login-error">Could not sign in ({err}).</p>}
        <a className="button primary login-button" href="/api/auth/google">
          Sign in with Google
        </a>
      </div>
      <p className="login-credit">
        Created by <span className="login-credit__name">Bryan Rivera</span> · © 2026
      </p>
    </div>
  );
}
