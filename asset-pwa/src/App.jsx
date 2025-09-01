import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
import Items from "./pages/Items.jsx";
import Entries from "./pages/Entries.jsx";

export default function App({ onLoggedOut }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("av_token");
    onLoggedOut?.();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">💼</span>
          <strong>AssetVault</strong>
          <span className="muted">— IT Asset Manager</span>
        </div>

        <nav className="tabs">
          <NavLink to="/" end className={({isActive}) => isActive ? "tab active" : "tab"}>Items</NavLink>
          <NavLink to="/entries" className={({isActive}) => isActive ? "tab active" : "tab"}>Entries</NavLink>
        </nav>

        <div className="actions">
          <button className="btn" onClick={logout} title="Sign out">Logout</button>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Items />} />
          <Route path="/entries" element={<Entries />} />
        </Routes>
      </main>
    </div>
  );
}
