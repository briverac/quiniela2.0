import { Routes, Route, Navigate, Outlet, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiJson } from "./api";
import Login from "./pages/Login";
import Predictions from "./pages/Predictions";
import Leaderboards from "./pages/Leaderboards";
import Manage from "./pages/Manage";
import Faq from "./pages/Faq";
import Groups from "./pages/Groups";
import AdminMatches from "./pages/admin/AdminMatches";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminLeaderboards from "./pages/admin/AdminLeaderboards";

type Me = { user: { id: number; email: string; name: string | null; picture: string | null; admin: boolean } | null };

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiJson<Me>("/api/me")
      .then(setMe)
      .catch(() => setMe({ user: null }))
      .finally(() => setLoading(false));
  }, []);
  return { me, loading, reload: () => apiJson<Me>("/api/me").then(setMe) };
}

function Layout() {
  const { me, loading } = useMe();
  const nav = useNavigate();
  if (loading) return <div className="page">Loading…</div>;
  if (!me?.user) return <Navigate to="/login" replace />;
  return (
    <div className="layout">
      <header className="header">
        <Link to="/predictions" className="brand">
          Quiniela
        </Link>
        <nav className="nav">
          <Link to="/predictions">Predictions</Link>
          <Link to="/leaderboards">Leaderboards</Link>
          <Link to="/manage">Manage</Link>
          <Link to="/groups">Groups</Link>
          <Link to="/faq">FAQ</Link>
          {me.user.admin && (
            <>
              <Link to="/admin/matches">Admin matches</Link>
              <Link to="/admin/users">Admin users</Link>
              <Link to="/admin/leaderboards">Admin boards</Link>
            </>
          )}
        </nav>
        <div className="userbox">
          {me.user.picture && <img src={me.user.picture} alt="" className="avatar" />}
          <span>{me.user.name ?? me.user.email}</span>
          <button
            type="button"
            className="linkbtn"
            onClick={async () => {
              await apiJson("/api/auth/logout", { method: "POST" });
              nav("/login");
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet context={{ user: me.user }} />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/predictions" replace />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/leaderboards" element={<Leaderboards />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/admin/matches" element={<AdminMatches />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/leaderboards" element={<AdminLeaderboards />} />
      </Route>
      <Route path="*" element={<Navigate to="/predictions" replace />} />
    </Routes>
  );
}
