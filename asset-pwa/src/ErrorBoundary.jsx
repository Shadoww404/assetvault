// src/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    // Store whatever was thrown – could be Error, string, or plain object
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error:", error, info);
  }

  render() {
  if (this.state.error) {
    const raw = this.state.error?.message ?? this.state.error;
    let msg;

    if (typeof raw === "string") {
      msg = raw;
    } else {
      try {
        msg = JSON.stringify(raw, null, 2);
      } catch {
        msg = String(raw);
      }
    }

    return (
      <div className="page-in">
        <div className="alert error" style={{ whiteSpace: "pre-wrap" }}>
          <h3>Something went wrong</h3>
          {msg}
        </div>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
  return this.props.children;
}

}
