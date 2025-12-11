// src/pages/Services.jsx
import { useEffect, useMemo, useState } from "react";
import {
  searchItemsLite,
  listServiceRecords,
  addServiceRecord,
  getServiceStatus,
  listServiceOverview,
} from "../api";
import errorText from "../ui/errorText";
import { usePagination, PaginationControls } from "../ui/pagination";

function pillStyle(status) {
  if (status === "ok")
    return { background: "#e6f4ea", color: "#137333", border: "1px solid #c5e6cf" };
  if (status === "never")
    return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  return { background: "#fde8e8", color: "#b42318", border: "1px solid #f5c2c0" }; // due
}

export default function ServicesPage() {
  // ---- Overview (all equipment) ----
  const [overview, setOverview] = useState([]);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovErr, setOvErr] = useState("");
  const [ovSearch, setOvSearch] = useState("");
  const [ovSort, setOvSort] = useState("due-first"); // due-first | recent-first | name | dept
  const [showOnlyDue, setShowOnlyDue] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      setOvLoading(true);
      setOvErr("");
      try {
        const { data } = await listServiceOverview();
        if (on) setOverview(data || []);
      } catch (e) {
        if (on) setOvErr(errorText(e, "Failed to load overview"));
      } finally {
        if (on) setOvLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const filteredOverview = useMemo(() => {
    const needle = (ovSearch || "").toLowerCase().trim();
    let rows = overview;
    if (needle) {
      rows = rows.filter((r) => {
        const hay = [
          r.item_id,
          r.name,
          r.serial_no,
          r.department,
          r.status,
          r.last_service_date,
          r.due_date,
        ]
          .map((x) => (x || "").toString().toLowerCase())
          .join(" ");
        return hay.includes(needle);
      });
    }
    if (showOnlyDue) rows = rows.filter((r) => r.status === "due" || r.status === "never");

    const a = [...rows];
    if (ovSort === "due-first") {
      a.sort((x, y) => {
        const rx = x.status === "due" || x.status === "never" ? 0 : 1;
        const ry = y.status === "due" || y.status === "never" ? 0 : 1;
        if (rx !== ry) return rx - ry;
        if (x.status === "ok" && y.status === "ok") {
          const dx = x.due_date ? new Date(x.due_date).getTime() : Infinity;
          const dy = y.due_date ? new Date(y.due_date).getTime() : Infinity;
          return dx - dy; // soonest due first
        }
        const score = (r) => (r.status === "never" ? Infinity : r.days_overdue || 0);
        return score(y) - score(x); // most overdue first, then never
      });
    } else if (ovSort === "recent-first") {
      a.sort((x, y) => {
        const dx = x.last_service_date ? new Date(x.last_service_date).getTime() : 0;
        const dy = y.last_service_date ? new Date(y.last_service_date).getTime() : 0;
        return dy - dx;
      });
    } else if (ovSort === "name") {
      a.sort((x, y) => (x.name || "").localeCompare(y.name || ""));
    } else if (ovSort === "dept") {
      a.sort((x, y) => (x.department || "").localeCompare(y.department || ""));
    }
    return a;
  }, [overview, ovSearch, ovSort, showOnlyDue]);

  // Shared pagination hook for overview table
  const {
    page: ovPage,
    pageSize: ovPageSize,
    setPageSize: setOvPageSize,
    pageCount: ovTotalPages,
    total: ovTotal,
    rows: paginatedOverview,
    next: ovNext,
    prev: ovPrev,
  } = usePagination(filteredOverview, 15);

  // ---- Detail panel ----
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState([]);
  const [picked, setPicked] = useState(null); // { item_id, name }
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviced, setServiced] = useState(true);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // typeahead
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q || q.length < 2) {
        setOpts([]);
        return;
      }
      try {
        const { data } = await searchItemsLite(q);
        setOpts((data || []).slice(0, 8));
      } catch {
        // ignore
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const loadData = async (itemId) => {
    if (!itemId) return;
    setLoading(true);
    setErr("");
    try {
      const [{ data: st }, { data: rows }] = await Promise.all([
        getServiceStatus(itemId),
        listServiceRecords(itemId),
      ]);
      setStatus(st);
      setHistory(rows || []);
    } catch (e) {
      setErr(errorText(e, "Failed to load service data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (picked?.item_id) loadData(picked.item_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.item_id]);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!picked?.item_id) return;
    setBusy(true);
    setErr("");
    try {
      await addServiceRecord(picked.item_id, {
        service_date: date || null,
        serviced,
        location: location || null,
        notes: notes || null,
      });
      setNotes("");
      setLocation("");

      await Promise.all([
        loadData(picked.item_id),
        (async () => {
          try {
            const { data } = await listServiceOverview();
            setOverview(data || []);
          } catch {
            // ignore
          }
        })(),
      ]);
    } catch (e2) {
      setErr(errorText(e2, "Failed to save service record"));
    } finally {
      setBusy(false);
    }
  };

  const onPickFromOverview = (row) => {
    setPicked({ item_id: row.item_id, name: row.name || "" });
    setQ("");
    setOpts([]);
  };

  const statusLabel = useMemo(() => {
    if (!status) return "";
    if (status.status === "ok") {
      return `Serviced (last: ${status.last_service_date}, due: ${status.due_date})`;
    }
    if (status.status === "never") {
      return "Never serviced — due now";
    }
    const extra = status.days_overdue ? `, ${status.days_overdue} days overdue` : "";
    return `Due service (last: ${status.last_service_date ?? "—"}${
      status.due_date ? `, due: ${status.due_date}` : ""
    }${extra})`;
  }, [status]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Services</h1>
          <p className="muted">
            Due at the top, then recently serviced. Click any row to view &amp; add
            records.
          </p>
        </div>
      </div>

      {/* Overview */}
      <div className="card card-elev">
        <div className="card-head">
          <h3 className="card-title">All equipment</h3>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              className="input"
              placeholder="Search by id, name, serial, dept…"
              value={ovSearch}
              onChange={(e) => setOvSearch(e.target.value)}
              style={{ width: 260 }}
            />
            <select
              className="input"
              value={ovSort}
              onChange={(e) => setOvSort(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="due-first">Sort: Due first</option>
              <option value="recent-first">Sort: Recently serviced first</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="dept">Sort: Department (A–Z)</option>
            </select>
            <label className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={showOnlyDue}
                onChange={(e) => setShowOnlyDue(e.target.checked)}
              />
              Show only due/never
            </label>
          </div>
        </div>

        <div className="card-body">
          {ovErr && <div className="alert error">{ovErr}</div>}

          {ovLoading ? (
            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Item ID</th>
                    <th>Name</th>
                    <th>Serial</th>
                    <th>Department</th>
                    <th>Last service</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 80, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 90, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 200, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 120, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 140, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 120, borderRadius: 6 }}
                        />
                      </td>
                      <td>
                        <div
                          className="skel"
                          style={{ height: 12, width: 120, borderRadius: 6 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Item ID</th>
                    <th>Name</th>
                    <th>Serial</th>
                    <th>Department</th>
                    <th>Last service</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOverview.map((r) => (
                    <tr
                      key={r.item_id}
                      className="row-click"
                      onClick={() => onPickFromOverview(r)}
                      title="Open in detail panel below"
                    >
                      <td>
                        <span className="pill" style={pillStyle(r.status)}>
                          {r.status === "ok"
                            ? "OK"
                            : r.status === "never"
                            ? "Never"
                            : "Due"}
                        </span>
                      </td>
                      <td className="mono">{r.item_id}</td>
                      <td>{r.name || "—"}</td>
                      <td className="mono">{r.serial_no || "—"}</td>
                      <td>{r.department || "—"}</td>
                      <td>{r.last_service_date || "—"}</td>
                      <td>
                        {r.status === "ok"
                          ? r.due_date || "—"
                          : r.due_date || "Now"}
                      </td>
                    </tr>
                  ))}
                  {filteredOverview.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        No matches
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls using shared component */}
          {!ovLoading && filteredOverview.length > 0 && (
            <PaginationControls
              page={ovPage}
              pageCount={ovTotalPages}
              pageSize={ovPageSize}
              setPageSize={setOvPageSize}
              total={ovTotal}
              next={ovNext}
              prev={ovPrev}
            />
          )}
        </div>
      </div>

      {/* Pick item */}
      <div className="card card-elev">
        <div className="card-head">
          <h3>Pick item</h3>
        </div>
        <div className="card-body">
          <div className="control full">
            <label>Item</label>
            <div className="typeahead">
              <input
                className="input"
                value={picked ? `${picked.item_id} — ${picked.name || ""}` : q}
                onChange={(e) => {
                  setPicked(null);
                  setQ(e.target.value);
                }}
                placeholder="Type item id / name / serial…"
                autoComplete="off"
              />
              {!picked && q && opts.length > 0 && (
                <div className="menu">
                  {opts.map((it) => (
                    <button
                      type="button"
                      key={it.item_id}
                      className="menu-item"
                      onClick={() => {
                        setPicked(it);
                        setQ("");
                        setOpts([]);
                      }}
                    >
                      <div className="mono">{it.item_id}</div>
                      <div className="muted">{it.name || ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {picked && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div className="pill" style={pillStyle(status?.status)}>
                {status ? statusLabel : "Loading…"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add record */}
      {picked && (
        <div className={`card card-elev ${busy ? "disabled" : ""}`}>
          <div className="card-head">
            <h3>Add service record</h3>
          </div>
          <form onSubmit={onAdd}>
            <div className="card-body">
              {err && (
                <div className="alert error" style={{ marginBottom: 12 }}>
                  {err}
                </div>
              )}
              <div className="grid-two">
                <div className="control">
                  <label>Service date</label>
                  <input
                    className="input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="control">
                  <label>Was it serviced?</label>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <input
                      id="svc_chk"
                      type="checkbox"
                      checked={serviced}
                      onChange={(e) => setServiced(e.target.checked)}
                    />
                    <label htmlFor="svc_chk">Yes, service completed</label>
                  </div>
                </div>
              </div>

              <div className="grid-two">
                <div className="control">
                  <label>
                    Location / Vendor <span className="muted">(optional)</span>
                  </label>
                  <input
                    className="input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., PrinterTech Pvt Ltd, Colombo"
                  />
                </div>
                <div className="control">
                  <label>Notes</label>
                  <input
                    className="input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What was done, issues, parts…"
                  />
                </div>
              </div>
            </div>
            <div className="card-foot t-right">
              <button className="btn primary">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* History (single item) */}
      {picked && (
        <div className="card">
          <div className="card-head">
            <h3>Service history</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : history.length === 0 ? (
              <div className="empty">No records yet</div>
            ) : (
              <div className="table-wrap">
                <table className="table table-modern">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Notes</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id}>
                        <td>{r.service_date}</td>
                        <td>
                          <span
                            className="pill"
                            style={pillStyle(r.serviced ? "ok" : "due")}
                          >
                            {r.serviced ? "Serviced" : "Not serviced"}
                          </span>
                        </td>
                        <td>{r.location || "-"}</td>
                        <td className="wrap">{r.notes || ""}</td>
                        <td>{r.created_by || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
