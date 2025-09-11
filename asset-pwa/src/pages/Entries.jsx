// src/pages/Entries.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { listItems, searchItems, listPhotos } from "../api";

function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d.replace(" ", "T")));
  } catch {
    return d;
  }
}

export default function Entries() {
  // search & data
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);

  // loading with no-flicker skeleton
  const [loading, setLoading] = useState(true);
  const [showSkel, setShowSkel] = useState(false);
  const firstRealMount = useRef(false); // survives StrictMode double-mount

  // preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewPhotos, setPreviewPhotos] = useState([]); // [{id, photo_url}] or strings
  const [activeIdx, setActiveIdx] = useState(0);

  const apiBase = import.meta.env.VITE_API_URL || "";

  // single debounced loader (prevents initial double-load & flicker)
  useEffect(() => {
    let cancelled = false;

    // debounce while typing; no delay for the first real load
    const delay = firstRealMount.current ? 250 : 0;

    setLoading(true);
    // only show skeleton if it takes longer than 120ms
    const skelTimer = setTimeout(() => {
      if (!cancelled) setShowSkel(true);
    }, 120);

    const t = setTimeout(async () => {
      try {
        const { data } = q ? await searchItems(q) : await listItems();
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) {
          clearTimeout(skelTimer);
          setShowSkel(false);
          setLoading(false);
          firstRealMount.current = true;
        }
      }
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(skelTimer);
    };
  }, [q]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at.replace(" ", "T")).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at.replace(" ", "T")).getTime() : 0;
      return db - da; // newest first
    });
  }, [rows]);

  const openPreview = useCallback(async (item) => {
    setPreviewItem(item);
    setActiveIdx(0);
    try {
      // Will work when item_id exists; otherwise we gracefully fall back below.
      const resp = await listPhotos(item.item_id);
      const ph = resp.data || [];
      const arr = ph.length ? ph : item.photo_url ? [{ photo_url: item.photo_url }] : [];
      setPreviewPhotos(arr);
    } catch {
      const arr =
        item.photos?.length ? item.photos : item.photo_url ? [{ photo_url: item.photo_url }] : [];
      setPreviewPhotos(arr);
    }
    setPreviewOpen(true);
  }, []);

  const onClosePreview = () => {
    setClosing(true);
    setTimeout(() => {
      setPreviewOpen(false);
      setClosing(false);
    }, 180); // match .modal-out duration
  };

  // keyboard nav for modal
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClosePreview();
      if (e.key === "ArrowRight")
        setActiveIdx((i) => (i + 1) % Math.max(1, previewPhotos.length || 1));
      if (e.key === "ArrowLeft")
        setActiveIdx(
          (i) =>
            (i - 1 + Math.max(1, previewPhotos.length || 1)) %
            Math.max(1, previewPhotos.length || 1)
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, previewPhotos.length]);

  return (
    <div className="entries page-in">
      <div className="toolbar row between">
        <h3>Entries</h3>
        <div className="search">
          <span className="search-ico" aria-hidden>
            🔎
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, serial, model…"
          />
        </div>
      </div>

      {loading && showSkel ? (
        <div className="table-wrap pro">
          <table className="table pro">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Serial</th>
                <th>Dept</th>
                <th>Owner</th>
                <th>From → To</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <div className="skel" style={{ height: 12, width: 120, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 180, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 120, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 100, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 120, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 150, borderRadius: 6 }} />
                  </td>
                  <td>
                    <div className="skel" style={{ height: 12, width: 120, borderRadius: 6 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap pro">
          <table className="table pro">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Serial</th>
                <th>Dept</th>
                <th>Owner</th>
                <th>From → To</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.item_id ?? r.serial_no ?? r.name}
                  className="row-click"
                  onClick={() => openPreview(r)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openPreview(r);
                  }}
                  title="View details"
                >
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.name}</td>
                  <td>{r.serial_no || "-"}</td>
                  <td>{r.department || "-"}</td>
                  <td>{r.owner || "-"}</td>
                  <td>{(r.transfer_from || "-") + " → " + (r.transfer_to || "-")}</td>
                  <td>{r.created_by || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && previewItem && (
        <div className="preview-wrap" role="dialog" aria-modal="true" aria-label="Asset preview">
          <div className={`preview ${closing ? "modal-out" : "modal-in"}`}>
            <div className="preview-head">
              <div>
                {/* Removed ID pill; show name only */}
                <h3>{previewItem.name}</h3>
                <div className="muted small">
                  By <b>{previewItem.created_by || "-"}</b> on{" "}
                  <b>{fmtDate(previewItem.created_at)}</b>
                </div>
              </div>
              <button className="btn ghost" onClick={onClosePreview} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="preview-body">
              {/* Left: photo viewer */}
              <div className="viewer">
                <div className="main">
                  {previewPhotos.length ? (
                    <>
                      <button
                        className="nav prev"
                        aria-label="Previous"
                        onClick={() =>
                          setActiveIdx((i) => (i - 1 + previewPhotos.length) % previewPhotos.length)
                        }
                      >
                        ‹
                      </button>
                      <img
                        src={`${apiBase}${
                          previewPhotos[activeIdx].photo_url ?? previewPhotos[activeIdx]
                        }`}
                        alt=""
                      />
                      <button
                        className="nav next"
                        aria-label="Next"
                        onClick={() =>
                          setActiveIdx((i) => (i + 1) % previewPhotos.length)
                        }
                      >
                        ›
                      </button>
                    </>
                  ) : (
                    <div className="noimg">No photos</div>
                  )}
                </div>

                {previewPhotos.length > 1 && (
                  <div className="thumbs">
                    {previewPhotos.map((p, idx) => {
                      const url = p.photo_url ?? p;
                      return (
                        <button
                          key={p.id ?? url}
                          className={`tbtn ${idx === activeIdx ? "active" : ""}`}
                          onClick={() => setActiveIdx(idx)}
                          title={`Photo ${idx + 1}`}
                        >
                          <img src={`${apiBase}${url}`} alt="" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {previewPhotos.length > 0 && (
                  <div className="open-full">
                    <a
                      href={`${apiBase}${
                        previewPhotos[activeIdx].photo_url ?? previewPhotos[activeIdx]
                      }`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn"
                      title="Open original"
                    >
                      Open full size
                    </a>
                  </div>
                )}
              </div>

              {/* Right: details */}
              <div className="details">
                <div className="kv">
                  {/* Removed "Item ID" row */}
                  <label>Name</label>
                  <div>{previewItem.name}</div>
                  <label>Quantity</label>
                  <div>{previewItem.quantity}</div>
                  <label>Serial</label>
                  <div>{previewItem.serial_no || "-"}</div>
                  <label>Model</label>
                  <div>{previewItem.model_no || "-"}</div>
                  <label>Department</label>
                  <div>{previewItem.department || "-"}</div>
                  <label>Owner</label>
                  <div>{previewItem.owner || "-"}</div>
                  <label>Transfer</label>
                  <div>
                    {(previewItem.transfer_from || "-") + " → " + (previewItem.transfer_to || "-")}
                  </div>
                </div>
                <div className="notes">
                  <label>Notes</label>
                  <div className="note-box">
                    {previewItem.notes ? previewItem.notes : <span className="muted">—</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            className={`preview-backdrop ${closing ? "backdrop-out" : "backdrop-in"}`}
            onClick={onClosePreview}
          />
        </div>
      )}
    </div>
  );
}
