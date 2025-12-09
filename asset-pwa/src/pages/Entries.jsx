// src/pages/Entries.jsx
import { useEffect, useMemo, useState } from "react";
import { listEntries } from "../api";
import errorText from "../ui/errorText";

export default function EntriesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  // pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const { data } = await listEntries(500); // fetch up to 500 latest
        if (on) setRows(data || []);
      } catch (e) {
        if (on) setErr(errorText(e, "Failed to load entries"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = (search || "").toLowerCase().trim();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.event_time,
        r.event,
        r.item_id,
        r.from_holder,
        r.to_holder,
        r.by_user,
        r.notes,
      ]
        .map((x) => (x || "").toString().toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }, [rows, search]);

  // reset to first page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, rows.length]);

  const totalPages = Math.max(1, Math.ceil((filtered.length || 0) / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Entries</h1>
          <p className="muted">
            Audit log of assignments, returns, transfers and service events.
          </p>
        </div>
      </div>

      <div className="card card-elev">
        <div className="card-head">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="card-title">Recent entries</h3>
            <input
              className="input"
              style={{ width: 260 }}
              placeholder="Search item, person, user, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="card-body">
          {err && <div className="alert error" style={{ marginBottom: 12 }}>{err}</div>}

          {loading ? (
            <div className="muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No entries yet</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table table-modern">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Item</th>
                      <th>From</th>
                      <th>To</th>
                      <th>By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{r.event_time}</td>
                        <td>{r.event}</td>
                        <td className="mono">{r.item_id}</td>
                        <td>{r.from_holder || "—"}</td>
                        <td>{r.to_holder || "—"}</td>
                        <td>{r.by_user || "—"}</td>
                        <td className="wrap">{r.notes || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div
                className="row"
                style={{
                  marginTop: 12,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="muted">Rows per page:</span>
                  <select
                    className="input"
                    style={{ width: 80 }}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="muted">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    ▶
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
