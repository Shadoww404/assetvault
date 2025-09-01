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

  useEffect(() => {
    const start = Date.now();
    const min = 550;
    const done = () => setTimeout(() => setBooting(false), Math.max(0, min - (Date.now() - start)));
    done();
  }, []);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === "av_token") setToken(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
                    element={<Login onLoggedIn={() => setToken(localStorage.getItem("av_token"))} />}
                  />
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </>
              ) : (
                <>
                  <Route
                    path="/*"
                    element={<App onLoggedOut={() => { localStorage.removeItem("av_token"); setToken(null); }} />}
                  />
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
