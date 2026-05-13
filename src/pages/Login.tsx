import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiJson } from "../api";

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
    <div className="page center">
      <h1>Quiniela</h1>
      <p className="muted">Prediction game — sign in with Google to play.</p>
      {err && <p className="error">Could not sign in ({err}).</p>}
      <a className="button primary" href="/api/auth/google">
        Sign in with Google
      </a>
    </div>
  );
}
