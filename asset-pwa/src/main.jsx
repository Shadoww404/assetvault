// src/main.jsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

import "./index.css";
import "./ui/motion.css";
import Preloader from "./Preloader.jsx";

function Root() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(() => localStorage.getItem("av_token"));

  // keep your soft-boot splash so route changes don’t “pop”
  useEffect(() => {
    const start = Date.now();
    const min = 550;
    const done = () =>
      setTimeout(() => setBooting(false), Math.max(0, min - (Date.now() - start)));
    done();
  }, []);

  // react to login/logout from other tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "av_token") setToken(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onLoggedIn = () => setToken(localStorage.getItem("av_token"));
  const onLoggedOut = () => {
    localStorage.removeItem("av_token");
    setToken(null);
  };

  return (
    <>
      {booting && <Preloader />}
      <ErrorBoundary>
        <BrowserRouter>
          <div className="page-in">
            <Routes>
              {!token ? (
                <>
                  <Route path="/login" element={<Login onLoggedIn={onLoggedIn} />} />
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </>
              ) : (
                <>
                  {/* App contains the authenticated shell + nested routes (see below) */}
                  <Route path="/*" element={<App onLoggedOut={onLoggedOut} />} />
                  {/* If someone hits /login while authed, bounce them home */}
                  <Route path="/login" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              )}
            </Routes>
          </div>
        </BrowserRouter>
      </ErrorBoundary>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
