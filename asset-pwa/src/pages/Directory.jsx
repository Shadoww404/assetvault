// src/pages/Directory.jsx
import { useEffect, useMemo, useState } from "react";
import {
  listDepartments,
  listPeople,
  listItems,
  searchItems,
} from "../api";
import FancySelect from "../ui/FancySelect.jsx";

function cls(...c) { return c.filter(Boolean).join(" "); }

export default function DirectoryPage() {
  // ---- Departments (for filtering people) ----
  const [deps, setDeps] = useState([{ id: "", name: "All departments" }]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listDepartments();
        setDeps([{ id: "", name: "All departments" }, ...data]);
      } catch {/* ignore */}
    })();
  }, []);

  // ---- People (read-only with search & dept filter) ----
  const [pDepId, setPDepId] = useState("");
  const [pQ, setPQ] = useState("");
  const [pRows, setPRows] = useState([]);
  const [pLoading, setPLoading] = useState(false);

  useEffect(() => {
    let on = true;
    const t = setTimeout(async () => {
      setPLoading(true);
      try {
        const { data } = await listPeople({
          dept_id: pDepId || undefined,
          q: pQ || undefined,
          limit: 200,
        });
        if (on) setPRows(data);
      } catch {/* ignore */} finally {
        if (on) setPLoading(false);
      }
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [pDepId, pQ]);

  // ---- Items (read-only with search) ----
  const [iQ, setIQ] = useState("");
  const [iRows, setIRows] = useState([]);
  const [iLoading, setILoading] = useState(false);

  const fetchItems = async (q) => {
    setILoading(true);
    try {
      const { data } = q && q.length >= 2 ? await searchItems(q) : await listItems();
      setIRows(data);
    } catch {/* ignore */} finally {
      setILoading(false);
    }
  };

  useEffect(() => {
    // initial load
    fetchItems("");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchItems(iQ), 250);
    return () => clearTimeout(t);
  }, [iQ]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Directory</h1>
          <p className="muted">Browse people and items. (Read-only)</p>
        </div>
      </div>

      <div className="grid two">
        {/* --- People card --- */}
        <div className="card card-elev">
          <div className="card-head">
            <h3 className="card-title">People</h3>
          </div>
          <div className="card-body">
            <div className="toolbar">
              <div className="control">
                <label>Department</label>
                <FancySelect
                  options={deps.map(d => ({ value: d.id ?? "", label: d.name }))}
                  value={pDepId}
                  onChange={setPDepId}
                  placeholder="All departments"
                />
              </div>
              <div className="control full">
                <label>Search</label>
                <div className="searchbar">
                  <input
                    className="input"
                    value={pQ}
                    onChange={(e)=>setPQ(e.target.value)}
                    placeholder="Search by name or employee code…"
                  />
                  {pQ && (
                    <button type="button" className="btn ghost sm" onClick={()=>setPQ("")}>Clear</button>
                  )}
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {pLoading && <tr><td colSpan={3} className="muted">Loading…</td></tr>}
                  {!pLoading && pRows.length === 0 && (
                    <tr><td colSpan={3} className="muted">No matches</td></tr>
                  )}
                  {pRows.map(p => (
                    <tr key={p.id}>
                      <td>{p.full_name}</td>
                      <td>{p.department_name || "—"}</td>
                      <td className="mono">{p.emp_code || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- Items card --- */}
        <div className="card card-elev">
          <div className="card-head">
            <h3 className="card-title">Items</h3>
          </div>
          <div className="card-body">
            <div className="toolbar">
              <div className="control full">
                <label>Search</label>
                <div className="searchbar">
                  <input
                    className="input"
                    value={iQ}
                    onChange={(e)=>setIQ(e.target.value)}
                    placeholder="Type at least 2 characters: item id, name, serial, model…"
                  />
                  {iQ && (
                    <button type="button" className="btn ghost sm" onClick={()=>setIQ("")}>Clear</button>
                  )}
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Name</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {iLoading && <tr><td colSpan={3} className="muted">Loading…</td></tr>}
                  {!iLoading && iRows.length === 0 && (
                    <tr><td colSpan={3} className="muted">No matches</td></tr>
                  )}
                  {iRows.map(it => (
                    <tr key={it.item_id}>
                      <td className="mono">{it.item_id}</td>
                      <td>{it.name}</td>
                      <td>{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
