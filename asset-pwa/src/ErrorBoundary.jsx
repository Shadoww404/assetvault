// src/ErrorBoundary.jsx
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("Render error:", error, info); }
  render(){
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div className="page-in">
          <div className="alert error" style={{ whiteSpace: "pre-wrap" }}>
            <h3>Something went wrong</h3>
            {msg}
          </div>
          <button className="btn" onClick={()=>this.setState({error:null})}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
