// src/App.jsx
import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { me } from "./api";

import ItemsPage from "./pages/Items.jsx";
import EntriesPage from "./pages/Entries.jsx";
import AssignmentsPage from "./pages/Assignments.jsx";
import AdminPage from "./pages/admin/Admin.jsx";
import DirectoryPage from "./pages/Directory.jsx";

export default function App({ onLoggedOut }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const clearAuth = () => {
    try {
      localStorage.removeItem("av_token");
      sessionStorage.removeItem("av_token");
    } catch {}
  };
  const broadcastLogout = () => {
    try { localStorage.setItem("av_logout", String(Date.now())); } catch {}
  };
  const doLogout = () => {
    clearAuth();
    broadcastLogout();
    if (typeof onLoggedOut === "function") onLoggedOut();
    else window.location.replace("/login");
  };

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data } = await me();
        if (on) setUser(data); // { username, role }
      } catch {
        if (on) doLogout();
      } finally {
        if (on) setAuthLoading(false);
      }
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      clearAuth();
      broadcastLogout();
    };
    const onStorage = (e) => {
      if (e.key === "av_logout") {
        clearAuth();
        if (typeof onLoggedOut === "function") onLoggedOut();
        else if (!location.pathname.startsWith("/login")) window.location.replace("/login");
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const AdminRoute = () => {
    if (authLoading) return <div className="page-in"><div className="muted">Loading…</div></div>;
    if (!user || user.role !== "admin") return <Navigate to="/directory" replace />;
    return <AdminPage />;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="bag">👜</span>
          <span className="name">AssetVault</span>
        </div>

        {/* animated nav */}
        <nav className="tabs">
          <NavLink to="/" end className={({isActive}) => isActive ? "tab active" : "tab"}>
            <span>Items</span>
          </NavLink>
          <NavLink to="/entries" className={({isActive}) => isActive ? "tab active" : "tab"}>
            <span>Entries</span>
          </NavLink>
          <NavLink to="/assignments" className={({isActive}) => isActive ? "tab active" : "tab"}>
            <span>Assignments</span>
          </NavLink>

          {/* Admins see Admin; others see Directory */}
          {!authLoading && (user?.role === "admin" ? (
            <NavLink to="/admin" className={({isActive}) => isActive ? "tab active" : "tab"}>
              <span>Admin</span>
            </NavLink>
          ) : (
            <NavLink to="/directory" className={({isActive}) => isActive ? "tab active" : "tab"}>
              <span>Directory</span>
            </NavLink>
          ))}
        </nav>

        <button className="btn ghost" onClick={doLogout}>Log out</button>
      </header>

      <main className="page-in">
        <Routes>
          <Route path="/" element={<ItemsPage />} />
          <Route path="/entries" element={<EntriesPage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
