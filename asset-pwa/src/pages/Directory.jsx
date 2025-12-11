// src/pages/Directory.jsx
import { useEffect, useState } from "react";
import {
  listDepartments,
  listPeople,
  listItems,
  searchItems,
  deletePerson,
  getPersonHistory,
} from "../api";
import FancySelect from "../ui/FancySelect.jsx";
import errorText from "../ui/errorText";
import { usePagination, PaginationControls } from "../ui/pagination";

function cls(...c) {
  return c.filter(Boolean).join(" ");
}

export default function DirectoryPage() {
  // ---- Departments (for filtering people) ----
  const [deps, setDeps] = useState([{ id: "", name: "All departments" }]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listDepartments();
        setDeps([{ id: "", name: "All departments" }, ...data]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // ---- People (read-only + admin delete with checks) ----
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
          limit: 500,
        });
        if (on) setPRows(data);
      } catch {
        /* ignore */
      } finally {
        if (on) setPLoading(false);
      }
    }, 250);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [pDepId, pQ]);

  // Pagination for people
  const {
    page: pPage,
    pageSize: pPageSize,
    setPageSize: setPPageSize,
    pageCount: pPageCount,
    total: pTotal,
    rows: pagedPeople,
    next: pNext,
    prev: pPrev,
  } = usePagination(pRows, 10);

  // Delete person handler with equipment checks + double confirmation
  const handleDeletePerson = async (p) => {
    // 1) First confirmation
    const ok = window.confirm(`Are you sure you want to delete/offboard ${p.full_name}?`);
    if (!ok) return;

    try{
      // 2) Fetch history and check any active assignments
      const { data: history } = await getPersonHistory(p.id);
      const active = (history || []).filter((h) => !h.returned_at);

      if (active.length > 0) {
        const list = active
          .map(
            (a) =>
              `• ${a.item_id} – ${a.item_name || "Unnamed"} (assigned ${
                a.assigned_at?.slice(0, 16) ?? ""
              })`
          )
          .join("\n");

        alert(
          `Cannot delete this person yet.\n\n` +
            `${p.full_name} still has the following equipment assigned:\n\n` +
            `${list}\n\n` +
            `Please transfer or return all equipment to another person or the available pool (Stock) first, then try again.`
        );
        return;
      }

      // 3) Double check before final delete
      const really = window.confirm(
        `Final confirm: delete/offboard ${p.full_name}?\n\n` +
          `This will mark them inactive in the system. Their past assignment history will be kept for audit.`
      );
      if (!really) return;

      // 4) Call API
      await deletePerson(p.id);

      // 5) Remove from local state so UI updates
      setPRows((rows) => rows.filter((x) => x.id !== p.id));
    } catch (e) {
      alert(errorText(e, "Failed to delete person"));
    }
  };

  // ---- Items (read-only with search + pagination) ----
  const [iQ, setIQ] = useState("");
  const [iRows, setIRows] = useState([]);
  const [iLoading, setILoading] = useState(false);

  const fetchItems = async (q) => {
    setILoading(true);
    try {
      const { data } =
        q && q.length >= 2 ? await searchItems(q) : await listItems();
      setIRows(data);
    } catch {
      /* ignore */
    } finally {
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

  const {
    page: iPage,
    pageSize: iPageSize,
    setPageSize: setIPageSize,
    pageCount: iPageCount,
    total: iTotal,
    rows: pagedItems,
    next: iNext,
    prev: iPrev,
  } = usePagination(iRows, 10);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Directory</h1>
          <p className="muted">
            Browse people and items. Admins can offboard people once all equipment is
            returned.
          </p>
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
                  options={deps.map((d) => ({
                    value: d.id ?? "",
                    label: d.name,
                  }))}
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
                    onChange={(e) => setPQ(e.target.value)}
                    placeholder="Search by name or employee code…"
                  />
                  {pQ && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setPQ("")}
                    >
                      Clear
                    </button>
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
                    <th>Status</th>
                    <th className="t-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pLoading && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!pLoading && pagedPeople.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No matches
                      </td>
                    </tr>
                  )}
                  {pagedPeople.map((p) => (
                    <tr key={p.id}>
                      <td>{p.full_name}</td>
                      <td>{p.department_name || "—"}</td>
                      <td className="mono">{p.emp_code || "—"}</td>
                      <td>{p.status || "active"}</td>
                      <td className="t-right">
                        <button
                          type="button"
                          className="btn ghost danger"
                          onClick={() => handleDeletePerson(p)}
                          title="Admin only – offboard person"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={pPage}
              pageCount={pPageCount}
              pageSize={pPageSize}
              setPageSize={setPPageSize}
              total={pTotal}
              next={pNext}
              prev={pPrev}
            />
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
                    onChange={(e) => setIQ(e.target.value)}
                    placeholder="Type at least 2 characters: item id, name, serial, model…"
                  />
                  {iQ && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setIQ("")}
                    >
                      Clear
                    </button>
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
                  {iLoading && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!iLoading && pagedItems.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No matches
                      </td>
                    </tr>
                  )}
                  {pagedItems.map((it) => (
                    <tr key={it.item_id}>
                      <td className="mono">{it.item_id}</td>
                      <td>{it.name}</td>
                      <td>{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={iPage}
              pageCount={iPageCount}
              pageSize={iPageSize}
              setPageSize={setIPageSize}
              total={iTotal}
              next={iNext}
              prev={iPrev}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
