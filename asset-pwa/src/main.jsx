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

const getToken = () =>
  sessionStorage.getItem("av_token") ?? localStorage.getItem("av_token");

function Root() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState(() => getToken());

  // keep your soft-boot splash so route changes don’t “pop”
  useEffect(() => {
    const start = Date.now();
    const min = 550;
    const done = () =>
      setTimeout(
        () => setBooting(false),
        Math.max(0, min - (Date.now() - start))
      );
    done();
  }, []);

  // react to login/logout from other tabs (localStorage only)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "av_token") {
        setToken(e.newValue);
      }
      if (e.key === "av_logout") {
        setToken(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onLoggedIn = () => setToken(getToken());
  const onLoggedOut = () => {
    try { sessionStorage.removeItem("av_token"); } catch {}
    try { localStorage.removeItem("av_token"); } catch {}
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
                  <Route
                    path="/login"
                    element={<Login onLoggedIn={onLoggedIn} />}
                  />
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </>
              ) : (
                <>
                  {/* App contains the authenticated shell + nested routes */}
                  <Route path="/*" element={<App onLoggedOut={onLoggedOut} />} />
                  {/* If someone hits /login while authed, bounce them to dashboard */}
                  <Route
                    path="/login"
                    element={<Navigate to="/dashboard" replace />}
                  />
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
