// src/ui/FancySelect.jsx
import { useEffect, useMemo, useRef, useState } from "react";

export default function FancySelect({
  options = [],              // [{ value: "", label: "All departments" }, ...]
  value,
  onChange,
  placeholder = "Select…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);

  const map = useMemo(() => {
    const byValue = new Map(options.map((o) => [String(o.value ?? ""), o]));
    const idx = options.findIndex((o) => String(o.value ?? "") === String(value ?? ""));
    return { byValue, idx };
  }, [options, value]);

  // Close on outside click
  useEffect(() => {
    function onDocDown(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // Keep highlighted in view
  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current?.querySelector?.(".fs-option.active");
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlight]);

  const selected = map.byValue.get(String(value ?? ""));

  const openMenu = () => {
    setOpen(true);
    setHighlight(map.idx >= 0 ? map.idx : 0);
  };

  const choose = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")){
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault(); setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault(); setHighlight(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      e.preventDefault(); setOpen(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`fs ${className}`}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="fs-trigger"
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className={selected ? "" : "muted"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="fs-caret" width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M5 7l5 6 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="fs-menu" role="listbox">
          {options.map((opt, i) => {
            const active = i === highlight;
            const sel = String(opt.value ?? "") === String(value ?? "");
            return (
              <button
                type="button"
                role="option"
                aria-selected={sel}
                key={String(opt.value ?? i)}
                className={`fs-option ${active ? "active" : ""} ${sel ? "selected" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(opt)}
              >
                <span className="fs-label">{opt.label}</span>
                {sel && <span className="fs-tick">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
