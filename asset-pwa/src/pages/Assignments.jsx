// src/pages/Assignments.jsx
import { useEffect, useMemo, useState } from "react";
import {
  listDepartments,
  listPeople,
  getPerson,
  getPersonHistory,
  searchItemsLite,
  assignToPerson,
  returnAssignment,
  transferAssignment,
} from "../api";
import FancySelect from "../ui/FancySelect.jsx";

function cls(...c) { return c.filter(Boolean).join(" "); }
const fmt = (s) => { if (!s) return ""; const d = new Date((s+"").replace(" ","T")); return Number.isNaN(d.getTime()) ? s : d.toLocaleString(); };
const initials = (name="") => name.split(" ").filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join("");

export default function AssignmentsPage() {
  const [deps, setDeps] = useState([]);
  const [depId, setDepId] = useState("");
  const [q, setQ] = useState("");

  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const [pid, setPid] = useState(null);
  const [person, setPerson] = useState(null);
  const [history, setHistory] = useState([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // person-assign form
  const [findQ, setFindQ] = useState("");
  const [findOpts, setFindOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");

  // modal transfer (when viewing a person)
  const [xferOpen, setXferOpen] = useState(false);
  const [xferItemId, setXferItemId] = useState("");
  const [xferQ, setXferQ] = useState("");
  const [xferPeople, setXferPeople] = useState([]);
  const [xferTo, setXferTo] = useState(null);
  const [xferDue, setXferDue] = useState("");
  const [xferNotes, setXferNotes] = useState("");

  // quick transfer (no person selected)
  const [qtItemQ, setQtItemQ] = useState("");
  const [qtItemOpts, setQtItemOpts] = useState([]);
  const [qtItem, setQtItem] = useState(null);
  const [qtPersonQ, setQtPersonQ] = useState("");
  const [qtPeople, setQtPeople] = useState([]);
  const [qtPerson, setQtPerson] = useState(null);
  const [qtDue, setQtDue] = useState("");
  const [qtNotes, setQtNotes] = useState("");
  const [qtBusy, setQtBusy] = useState(false);

  const active = useMemo(() => history.filter(h => !h.returned_at), [history]);

  // deps
  useEffect(() => { (async () => {
    try { const { data } = await listDepartments(); setDeps([{id:"",name:"All departments"}, ...data]); } catch {}
  })(); }, []);

  // people rail
  useEffect(() => {
    let on = true;
    (async () => {
      setLoadingPeople(true);
      try {
        const { data } = await listPeople({ dept_id: depId || undefined, q: q || undefined, limit: 60 });
        if (on) setPeople(data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Failed to load people");
      } finally {
        if (on) setLoadingPeople(false);
      }
    })();
    return () => { on = false; };
  }, [depId, q]);

  // person + history  (fixed try/catch/finally)
  useEffect(() => {
    if (!pid) { setPerson(null); setHistory([]); return; }
    let on = true;
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const [{data:p}, {data:h}] = await Promise.all([getPerson(pid), getPersonHistory(pid)]);
        if (!on) return;
        setPerson(p);
        setHistory(h);
      } catch (e) {
        if (!on) return;
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail || e?.message || "Failed to load person";
        console.error("getPerson/getPersonHistory failed:", e);
        setErr(detail);
        if (status === 404) {
          setPid(null);
          setPerson(null);
          setHistory([]);
        }
        // 401 handled at app shell via /auth/me
      } finally {
        if (!on) return;
        setBusy(false);
      }
    })();
    return () => { on = false; };
  }, [pid]);

  // typeaheads
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!findQ || findQ.length < 2) { setFindOpts([]); return; }
      try { const { data } = await searchItemsLite(findQ); setFindOpts(data.slice(0,8)); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [findQ]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!xferQ || xferQ.length < 2) { setXferPeople([]); return; }
      try { const { data } = await listPeople({ q: xferQ, limit: 8 }); setXferPeople(data); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [xferQ]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!qtItemQ || qtItemQ.length < 2) { setQtItemOpts([]); return; }
      try { const { data } = await searchItemsLite(qtItemQ); setQtItemOpts(data.slice(0,8)); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [qtItemQ]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!qtPersonQ || qtPersonQ.length < 2) { setQtPeople([]); return; }
      try { const { data } = await listPeople({ q: qtPersonQ, limit: 8 }); setQtPeople(data); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [qtPersonQ]);

  const refreshHistory = async () => {
    if (!pid) return;
    try { const { data } = await getPersonHistory(pid); setHistory(data); } catch {}
  };

  // actions
  const onAssign = async (e) => {
    e.preventDefault();
    if (!pid || !picked) return;
    setBusy(true); setErr("");
    try {
      await assignToPerson({ item_id: picked.item_id || picked, person_id: pid, due_back_date: due || null, notes: notes || null });
      setFindQ(""); setFindOpts([]); setPicked(null); setDue(""); setNotes("");
      await refreshHistory();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Assignment failed"); }
    finally { setBusy(false); }
  };

  const onReturn = async (row) => {
    if (!confirm(`Mark ${row.item_id} returned from ${person?.full_name}?`)) return;
    setBusy(true); setErr("");
    try { await returnAssignment({ assignment_id: row.id, item_id: row.item_id, notes: "" }); await refreshHistory(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Return failed"); }
    finally { setBusy(false); }
  };

  const openTransfer = (row) => { setXferItemId(row.item_id); setXferQ(""); setXferPeople([]); setXferTo(null); setXferDue(""); setXferNotes(""); setXferOpen(true); };

  const onTransfer = async (e) => {
    e.preventDefault();
    if (!xferItemId || !xferTo) return;
    setBusy(true); setErr("");
    try {
      await transferAssignment({ item_id: xferItemId, to_person_id: xferTo.id, due_back_date: xferDue || null, notes: xferNotes || null });
      setXferOpen(false); await refreshHistory();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Transfer failed"); }
    finally { setBusy(false); }
  };

  const onQuickTransfer = async (e) => {
    e.preventDefault();
    if (!qtItem || !qtPerson) return;
    setQtBusy(true); setErr("");
    try {
      await transferAssignment({ item_id: qtItem.item_id || qtItem, to_person_id: qtPerson.id, due_back_date: qtDue || null, notes: qtNotes || null });
      setQtItemQ(""); setQtItemOpts([]); setQtItem(null);
      setQtPersonQ(""); setQtPeople([]); setQtPerson(null);
      setQtDue(""); setQtNotes("");
      if (pid === qtPerson.id) await refreshHistory();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Transfer failed"); }
    finally { setQtBusy(false); }
  };

  const depOptions = useMemo(() => deps.map(d => ({ value: d.id ?? "", label: d.name })), [deps]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Track who has which device. Assign, return, and transfer in one place.</p>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="assign-layout">
        {/* Left rail */}
        <aside className="card card-elev">
          <div className="card-body">
            <div className="toolbar">
              <div className="control">
                <label>Department</label>
                <FancySelect options={depOptions} onChange={(v)=>setDepId(typeof v==="object"?(v?.value??""):(v??""))} value={depId} placeholder="All departments" />
              </div>
              <div className="control">
                <label>Search people</label>
                <input className="input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="name or code…" />
              </div>
            </div>

            <div className="list scroll">
              {loadingPeople && <div className="muted">Loading…</div>}
              {!loadingPeople && people.length === 0 && (<div className="muted">No people</div>)}
              {people.map((p) => (
                <button key={p.id} className={cls("person-row", pid === p.id && "active")}
                        onClick={() => setPid(p.id)} title={p.emp_code ? `#${p.emp_code}` : ""}>
                  <span className="avatar">{initials(p.full_name)}</span>
                  <span className="info">
                    <span className="name">{p.full_name}</span>
                    <span className="meta">{p.department_name || "—"}{p.emp_code ? ` • ${p.emp_code}` : ""}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="content">
          {/* Quick Transfer card */}
          <div className="card card-elev">
            <div className="card-head">
              <div className="stack">
                <h3 className="card-title">Equipment Transfer</h3>
                <div className="muted">Move any saved item to a person (e.g., “IT Repairs”) in one step.</div>
              </div>
            </div>
            <form onSubmit={onQuickTransfer} className={qtBusy ? "disabled" : ""}>
              <div className="card-body">
                <div className="grid-two">
                  <div className="control">
                    <label>Item</label>
                    <div className="typeahead">
                      <input className="input" value={qtItemQ}
                             onChange={(e)=>{ setQtItemQ(e.target.value); setQtItem(null); }}
                             placeholder="Type item id / name / serial…" autoComplete="off" />
                      {qtItemQ && qtItemOpts.length > 0 && (
                        <div className="menu">
                          {qtItemOpts.map((it) => (
                            <button type="button" key={it.item_id} className="menu-item"
                                    onClick={()=>{ setQtItem(it); setQtItemQ(`${it.item_id} — ${it.name||""}`); setQtItemOpts([]); }}>
                              <div className="mono">{it.item_id}</div>
                              <div className="muted">{it.name || ""}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="control">
                    <label>To person</label>
                    <div className="typeahead">
                      <input className="input" value={qtPersonQ}
                             onChange={(e)=>{ setQtPersonQ(e.target.value); setQtPerson(null); }}
                             placeholder='e.g. "IT Repairs" or a person name' autoComplete="off" />
                      {qtPersonQ && qtPeople.length > 0 && (
                        <div className="menu">
                          {qtPeople.map((p) => (
                            <button type="button" key={p.id} className="menu-item"
                                    onClick={()=>{ setQtPerson(p); setQtPersonQ(p.full_name); setQtPeople([]); }}
                                    title={p.emp_code ? `#${p.emp_code}` : ""}>
                              <div>{p.full_name}</div>
                              <div className="muted">{p.department_name || p.emp_code || ""}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid-two">
                  <div className="control">
                    <label>New due date <span className="muted">(optional)</span></label>
                    <input className="input" type="date" value={qtDue} onChange={(e)=>setQtDue(e.target.value)} />
                  </div>
                  <div className="control">
                    <label>Notes</label>
                    <input className="input" value={qtNotes} onChange={(e)=>setQtNotes(e.target.value)} placeholder="optional…" />
                  </div>
                </div>
              </div>
              <div className="card-foot t-right">
                <button className="btn primary" disabled={qtBusy || !qtItem || !qtPerson}>Transfer</button>
              </div>
            </form>
          </div>

          {!pid && (
            <div className="card"><div className="card-body"><div className="muted">Pick a person on the left to view details.</div></div></div>
          )}

          {pid && person && (
            <>
              <div className="card card-elev">
                <div className="card-head">
                  <div className="stack">
                    <h3 className="card-title">{person.full_name}</h3>
                    <div className="muted">{person.department_name || ""}</div>
                  </div>
                  <div className="pill">{active.length} active</div>
                </div>

                <div className="card-body">
                  <div className="grid-two">
                    <section>
                      <div className="section-head"><h4>Current devices</h4></div>
                      {active.length === 0 ? (
                        <div className="empty">No active devices</div>
                      ) : (
                        <table className="table table-modern">
                          <thead><tr><th>Item</th><th>Name</th><th>Assigned</th><th>Due</th><th className="t-right">Actions</th></tr></thead>
                          <tbody>
                            {active.map((a) => (
                              <tr key={a.id}>
                                <td className="mono">{a.item_id}</td>
                                <td>{a.item_name || ""}</td>
                                <td>{fmt(a.assigned_at)}</td>
                                <td>{a.due_back_date || "—"}</td>
                                <td className="t-right">
                                  <div className="btn-row">
                                    <button className="btn ghost" onClick={()=>openTransfer(a)}>Transfer</button>
                                    <button className="btn danger" onClick={()=>onReturn(a)}>Return</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>

                    <section>
                      <div className="section-head"><h4>Assign new device</h4></div>
                      <form onSubmit={onAssign} className={busy ? "disabled" : ""}>
                        <div className="control">
                          <label>Find item</label>
                          <div className="typeahead">
                            <input className="input" value={findQ}
                                   onChange={(e)=>{ setFindQ(e.target.value); setPicked(null); }}
                                   placeholder="Type item id, name, serial…" autoComplete="off" />
                            {findQ && findOpts.length > 0 && (
                              <div className="menu">
                                {findOpts.map((it) => (
                                  <button type="button" key={it.item_id} className="menu-item"
                                          onClick={()=>{ setPicked(it); setFindQ(`${it.item_id} — ${it.name||""}`); setFindOpts([]); }}>
                                    <div className="mono">{it.item_id}</div>
                                    <div className="muted">{it.name}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid-two">
                          <div className="control">
                            <label>Due date <span className="muted">(optional)</span></label>
                            <input className="input" type="date" value={due} onChange={(e)=>setDue(e.target.value)} />
                          </div>
                          <div className="control">
                            <label>Notes</label>
                            <input className="input" value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="optional…" />
                          </div>
                        </div>

                        <div className="btn-row">
                          <button className="btn primary" disabled={busy || !picked}>Assign</button>
                        </div>
                      </form>
                    </section>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3 className="card-title">History</h3></div>
                <div className="card-body">
                  {history.length === 0 ? (
                    <div className="empty">No history yet</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-modern">
                        <thead><tr><th>Item</th><th>Name</th><th>Assigned</th><th>Returned</th><th>Notes</th></tr></thead>
                        <tbody>
                          {history.map((h) => (
                            <tr key={h.id}>
                              <td className="mono">{h.item_id}</td>
                              <td>{h.item_name || ""}</td>
                              <td>{fmt(h.assigned_at)}</td>
                              <td>{h.returned_at ? fmt(h.returned_at) : <span className="pill">Active</span>}</td>
                              <td className="wrap">{h.notes || ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Transfer modal */}
      {xferOpen && (
        <div className="modal on">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Transfer {xferItemId}</h3>
              <button className="icon" onClick={()=>setXferOpen(false)}>✕</button>
            </div>

            <form onSubmit={onTransfer} className={busy ? "disabled" : ""}>
              <div className="modal-body">
                <div className="control">
                  <label>To person</label>
                  <div className="typeahead">
                    <input className="input" value={xferQ}
                           onChange={(e)=>{ setXferQ(e.target.value); setXferTo(null); }}
                           placeholder="Search…" autoComplete="off" />
                    {xferQ && xferPeople.length > 0 && (
                      <div className="menu">
                        {xferPeople.map((p) => (
                          <button type="button" key={p.id} className="menu-item"
                                  onClick={()=>{ setXferTo(p); setXferQ(p.full_name); setXferPeople([]); }}>
                            <div>{p.full_name}</div>
                            <div className="muted">{p.department_name || p.emp_code || ""}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid-two">
                  <div className="control">
                    <label>New due date <span className="muted">(optional)</span></label>
                    <input className="input" type="date" value={xferDue} onChange={(e)=>setXferDue(e.target.value)} />
                  </div>
                  <div className="control">
                    <label>Notes</label>
                    <input className="input" value={xferNotes} onChange={(e)=>setXferNotes(e.target.value)} placeholder="optional…" />
                  </div>
                </div>
              </div>

              <div className="modal-foot">
                <button type="button" className="btn" onClick={()=>setXferOpen(false)}>Cancel</button>
                <button className="btn primary" disabled={busy || !xferTo}>Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
