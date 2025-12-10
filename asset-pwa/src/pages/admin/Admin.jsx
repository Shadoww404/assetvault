// src/pages/admin/Admin.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listPeople,
  createPerson,
  updatePerson,
  deletePerson,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../../api";
import FancySelect from "../../ui/FancySelect.jsx";
import errorText from "../../ui/errorText";

// Very simple CSV parser: header row + comma-separated values (no quoted commas)
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const headerRaw = lines[0].split(",").map((h) => h.trim());
  const headers = headerRaw.map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

export default function AdminPage() {
  // Data
  const [deps, setDeps] = useState([]);
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);

  // Errors + busy
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Search bars
  const [qUsers, setQUsers] = useState("");
  const [qPeople, setQPeople] = useState("");
  const [qItems, setQItems] = useState("");

  // Forms
  const [deptEdit, setDeptEdit] = useState(null);
  const [deptName, setDeptName] = useState("");

  const emptyP = {
    id: null,
    full_name: "",
    emp_code: "",
    department_id: "",
    email: "",
    phone: "",
    status: "",
  };
  const [pForm, setPForm] = useState(emptyP);

  const emptyI = {
    item_id: "",
    name: "",
    quantity: 0,
    serial_no: "",
    model_no: "",
    department: "",
    owner: "",
    notes: "",
    category: "Desktop",
  };
  const [iForm, setIForm] = useState(emptyI);

  const emptyU = {
    id: null,
    username: "",
    full_name: "",
    role: "staff",
    password: "",
  };
  const [uForm, setUForm] = useState(emptyU);

  // Deletion + CSV modals
  const [deletePersonModal, setDeletePersonModal] = useState(null); // {person,message,activeItems}
  const [csvModal, setCsvModal] = useState(null); // "people" | "items" | null

  // Hidden file inputs for CSV
  const peopleCsvInputRef = useRef(null);
  const itemsCsvInputRef = useRef(null);

  // Pagination state for People & Items
  const [peoplePage, setPeoplePage] = useState(0);
  const [peoplePageSize, setPeoplePageSize] = useState(10);
  const [itemsPage, setItemsPage] = useState(0);
  const [itemsPageSize, setItemsPageSize] = useState(10);

  // Load all
  const refresh = async () => {
    setErr("");
    setBusy(true);
    try {
      const [{ data: d }, { data: ppl }, { data: it }, { data: us }] =
        await Promise.all([
          listDepartments(),
          listPeople({ limit: 500 }),
          listItems(),
          listUsers(),
        ]);
      setDeps(d);
      setPeople(ppl);
      setItems(it);
      setUsers(us);
    } catch (e) {
      setErr(errorText(e, "Failed to load admin data"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Filters
  const filteredUsers = useMemo(() => {
    const q = qUsers.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
    );
  }, [users, qUsers]);

  const filteredPeople = useMemo(() => {
    const q = qPeople.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        (p.full_name || "").toLowerCase().includes(q) ||
        (p.emp_code || "").toLowerCase().includes(q) ||
        (p.department_name || "").toLowerCase().includes(q)
    );
  }, [people, qPeople]);

  const filteredItems = useMemo(() => {
    const q = qItems.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.serial_no || "").toLowerCase().includes(q) ||
        (it.model_no || "").toLowerCase().includes(q) ||
        (it.name || "").toLowerCase().includes(q) ||
        (it.item_id || "").toLowerCase().includes(q)
    );
  }, [items, qItems]);

  // Reset pages when filters change
  useEffect(() => {
    setPeoplePage(0);
  }, [qPeople, filteredPeople.length, peoplePageSize]);

  useEffect(() => {
    setItemsPage(0);
  }, [qItems, filteredItems.length, itemsPageSize]);

  // Clamp current page if list shrinks
  useEffect(() => {
    const maxPage =
      Math.max(0, Math.ceil(filteredPeople.length / peoplePageSize) - 1) || 0;
    if (peoplePage > maxPage) setPeoplePage(maxPage);
  }, [filteredPeople.length, peoplePage, peoplePageSize]);

  useEffect(() => {
    const maxPage =
      Math.max(0, Math.ceil(filteredItems.length / itemsPageSize) - 1) || 0;
    if (itemsPage > maxPage) setItemsPage(maxPage);
  }, [filteredItems.length, itemsPage, itemsPageSize]);

  // Sliced lists for current page
  const pagedPeople = useMemo(() => {
    const start = peoplePage * peoplePageSize;
    return filteredPeople.slice(start, start + peoplePageSize);
  }, [filteredPeople, peoplePage, peoplePageSize]);

  const pagedItems = useMemo(() => {
    const start = itemsPage * itemsPageSize;
    return filteredItems.slice(start, start + itemsPageSize);
  }, [filteredItems, itemsPage, itemsPageSize]);

  // ----- Departments -----
  const onDeptSave = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    try {
      if (deptEdit?.id) await updateDepartment(deptEdit.id, deptName.trim());
      else await createDepartment(deptName.trim());
      setDeptEdit(null);
      setDeptName("");
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "Dept save failed"));
    }
  };

  const onDeptEdit = (d) => {
    setDeptEdit(d);
    setDeptName(d.name);
  };

  const onDeptDelete = async (d) => {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try {
      await deleteDepartment(d.id);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "Dept delete failed"));
    }
  };

  // ----- People -----
  const onPersonEdit = (p) =>
    setPForm({
      id: p.id,
      full_name: p.full_name || "",
      emp_code: p.emp_code || "",
      department_id: p.department_id || "",
      email: p.email || "",
      phone: p.phone || "",
      status: p.status || "",
    });

  const onPersonSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      full_name: pForm.full_name.trim(),
      emp_code: (pForm.emp_code || "").trim() || null,
      department_id: pForm.department_id || null,
      email: (pForm.email || "").trim() || null,
      phone: (pForm.phone || "").trim() || null,
      status: (pForm.status || "").trim() || null,
    };
    try {
      if (pForm.id) await updatePerson(pForm.id, payload);
      else await createPerson(payload);
      setPForm(emptyP);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "Person save failed"));
    }
  };

  const onPersonDelete = async (p) => {
    if (!confirm(`Delete ${p.full_name}?`)) return;
    try {
      await deletePerson(p.id);
      await refresh();
    } catch (e2) {
      const status = e2?.response?.status;
      const detail = e2?.response?.data?.detail;

      if (status === 409 && detail && typeof detail === "object") {
        setDeletePersonModal({
          person: p,
          message:
            typeof detail.message === "string"
              ? detail.message
              : "This person still has active equipment assigned. Please transfer or return all items before deleting.",
          activeItems: Array.isArray(detail.active_items)
            ? detail.active_items
            : [],
        });
        setErr("");
      } else {
        setErr(errorText(e2, "Person delete failed"));
      }
    }
  };

  // ----- Items -----
  const onItemEdit = (it) =>
    setIForm({
      item_id: it.item_id,
      name: it.name || "",
      quantity: it.quantity || 0,
      serial_no: it.serial_no || "",
      model_no: it.model_no || "",
      department: it.department || "",
      owner: it.owner || "",
      notes: it.notes || "",
      category: it.category || "Other",
    });

  const genItemId = (src) => {
    const base = (src || "").toString().trim() || "item";
    const norm = base
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 32);
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${norm || "item"}-${suffix}`;
  };

  const createItemWithAutoId = async (rest) => {
    const base = rest.serial_no || rest.model_no || rest.name || "item";
    for (let attempt = 0; attempt < 3; attempt++) {
      const newId = genItemId(base);
      const fd = new FormData();
      fd.set("item_id", newId);
      fd.set("name", rest.name);
      fd.set("quantity", String(rest.quantity || 0));
      if (rest.serial_no) fd.set("serial_no", rest.serial_no);
      if (rest.model_no) fd.set("model_no", rest.model_no);
      if (rest.department) fd.set("department", rest.department);
      if (rest.owner) fd.set("owner", rest.owner);
      if (rest.notes) fd.set("notes", rest.notes);
      if (rest.category) fd.set("category", rest.category);

      try {
        await createItem(fd);
        return;
      } catch (e) {
        const code = e?.response?.status;
        const msg = e?.response?.data?.detail || "";
        if (code === 409 && /already exists/i.test(msg)) {
          continue;
        }
        throw e;
      }
    }
    throw new Error("Could not create item (ID collisions). Try again.");
  };

  const onItemSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const { item_id, ...rest } = iForm;
      if (item_id) {
        await updateItem(item_id, rest);
      } else {
        await createItemWithAutoId(rest);
      }
      setIForm(emptyI);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "Item save failed"));
    }
  };

  const onItemDelete = async (id) => {
    if (!confirm(`Delete item ${id}?`)) return;
    try {
      await deleteItem(id);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "Item delete failed"));
    }
  };

  // ----- Users -----
  const onUserEdit = (u) =>
    setUForm({
      id: u.id,
      username: u.username,
      full_name: u.full_name || "",
      role: u.role || "staff",
      password: "",
    });

  const onUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (uForm.id) {
        const body = {
          full_name: uForm.full_name || null,
          role: uForm.role || "staff",
          ...(uForm.password ? { new_password: uForm.password } : {}),
        };
        await updateUser(uForm.username, body);
      } else {
        if (!uForm.username || !uForm.password) {
          alert("Username and password are required");
          return;
        }
        await createUser({
          username: uForm.username,
          password: uForm.password,
          full_name: uForm.full_name || null,
          role: uForm.role || "staff",
        });
      }
      setUForm(emptyU);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "User save failed"));
    }
  };

  const onUserDelete = async (u) => {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try {
      await deleteUser(u.username);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2, "User delete failed"));
    }
  };

  // ----- CSV IMPORT HELPERS -----
  const importPeopleFromCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      let ok = 0;
      let fail = 0;

      for (const row of rows) {
        const full_name = row.full_name || row.name || "";
        if (!full_name) {
          fail++;
          continue;
        }

        const deptName = row.department || row.dept || "";
        let department_id = null;
        if (deptName) {
          const dep = deps.find(
            (d) => d.name.toLowerCase() === deptName.toLowerCase()
          );
          if (dep) department_id = dep.id;
        }

        const payload = {
          full_name,
          emp_code: row.emp_code || row.code || null,
          department_id,
          email: row.email || null,
          phone: row.phone || null,
          status: row.status || null,
        };

        try {
          await createPerson(payload);
          ok++;
        } catch (e) {
          console.error("Failed to import person row", row, e);
          fail++;
        }
      }

      await refresh();
      if (fail) {
        setErr(
          `CSV import for people: ${ok} rows imported, ${fail} failed. Check the data for missing required fields or unknown departments.`
        );
      } else {
        setErr(`CSV import for people: ${ok} rows imported successfully.`);
      }
    } catch (e) {
      setErr(errorText(e, "Failed to import people CSV"));
    } finally {
      setBusy(false);
    }
  };

  const importItemsFromCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      let ok = 0;
      let fail = 0;

      for (const row of rows) {
        const name = row.name || "";
        if (!name) {
          fail++;
          continue;
        }
        const qraw = row.quantity || row.qty || "0";
        const quantity = parseInt(qraw, 10) || 0;
        const category = row.category || "Other";

        const rest = {
          name,
          quantity,
          serial_no: row.serial_no || row.serial || "",
          model_no: row.model_no || row.model || "",
          department: row.department || row.dept || "",
          owner: row.owner || "",
          notes: row.notes || "",
          category,
        };

        try {
          await createItemWithAutoId(rest);
          ok++;
        } catch (e) {
          console.error("Failed to import item row", row, e);
          fail++;
        }
      }

      await refresh();
      if (fail) {
        setErr(
          `CSV import for items: ${ok} rows imported, ${fail} failed. Check the data for missing required fields.`
        );
      } else {
        setErr(`CSV import for items: ${ok} rows imported successfully.`);
      }
    } catch (e) {
      setErr(errorText(e, "Failed to import items CSV"));
    } finally {
      setBusy(false);
    }
  };

  // SMALL pager UI helper
  const renderPager = ({
    total,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
  }) => {
    if (!total) return null;
    const from = page * pageSize + 1;
    const to = Math.min(total, (page + 1) * pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
      <div
        className="row"
        style={{
          marginTop: 8,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 13,
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="muted">Rows per page</span>
          <select
            className="input"
            style={{ width: 72, padding: "2px 6px", height: 30 }}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className="muted">
            {from}–{to} of {total}
          </span>
          <button
            type="button"
            className="icon"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="icon"
            disabled={page >= totalPages - 1}
            onClick={() =>
              onPageChange(Math.min(totalPages - 1, page + 1))
            }
          >
            ›
          </button>
        </div>
      </div>
    );
  };

  // --- JSX ---
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">
            Manage users, departments, people and items.
          </p>
        </div>
      </div>

      {err && (
        <div className="alert error" style={{ whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {/* Users */}
      <div className="card card-elev">
        <div className="card-head">
          <h3>Users</h3>
        </div>
        <div className="card-body">
          <form className="grid two" onSubmit={onUserSubmit}>
            <div className="stack">
              <label>Username</label>
              <input
                className="input"
                placeholder="username"
                value={uForm.username}
                onChange={(e) =>
                  setUForm({ ...uForm, username: e.target.value })
                }
                disabled={!!uForm.id}
                required
              />
            </div>
            <div className="stack">
              <label>Full name</label>
              <input
                className="input"
                placeholder="Full name"
                value={uForm.full_name}
                onChange={(e) =>
                  setUForm({ ...uForm, full_name: e.target.value })
                }
              />
            </div>
            <div className="stack">
              <label>Role</label>
              <FancySelect
                options={[
                  { value: "staff", label: "Staff" },
                  { value: "admin", label: "Admin" },
                ]}
                value={uForm.role}
                onChange={(v) =>
                  setUForm({ ...uForm, role: v || "staff" })
                }
              />
            </div>
            <div className="stack">
              <label>{uForm.id ? "Reset password" : "Password"}</label>
              <input
                className="input"
                type="password"
                placeholder={
                  uForm.id
                    ? "leave blank to keep"
                    : "set an initial password"
                }
                value={uForm.password}
                onChange={(e) =>
                  setUForm({ ...uForm, password: e.target.value })
                }
              />
            </div>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <button
                className={`btn primary ${busy ? "loading" : ""}`}
                disabled={busy}
              >
                {uForm.id ? "Update user" : "Create user"}
              </button>
              {uForm.id && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setUForm(emptyU)}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="divider" />

          <div className="toolbar">
            <div className="control" style={{ width: 320 }}>
              <input
                className="input"
                placeholder="Search users (name, username, role)…"
                value={qUsers}
                onChange={(e) => setQUsers(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="table table-modern">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full name</th>
                  <th>Role</th>
                  <th className="t-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td>{u.full_name || "—"}</td>
                    <td>
                      <span className="pill">{u.role}</span>
                    </td>
                    <td className="t-right">
                      <div className="btn-row">
                        <button
                          className="btn ghost"
                          onClick={() => onUserEdit(u)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => onUserDelete(u)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No users
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3-column grid for Deps / People / Items */}
      <div className="grid three" style={{ marginTop: 16 }}>
        {/* Departments */}
        <div className="card card-elev">
          <div className="card-head">
            <h3>Departments</h3>
          </div>
          <div className="card-body">
            <form onSubmit={onDeptSave} className="stack">
              <input
                className="input"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Department name"
              />
              <div className="btn-row">
                <button className="btn primary">
                  {deptEdit ? "Update" : "Add"}
                </button>
                {deptEdit && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDeptEdit(null);
                      setDeptName("");
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            <div className="divider" />
            <table className="table table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="t-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deps.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="t-right">
                      <div className="btn-row">
                        <button
                          className="btn ghost"
                          onClick={() => onDeptEdit(d)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn danger"
                          onClick={() => onDeptDelete(d)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {deps.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted">
                      No departments
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* People */}
        <div className="card card-elev">
          <div className="card-head">
            <h3>People</h3>
          </div>
          <div className="card-body">
            <form onSubmit={onPersonSubmit} className="stack">
              <input
                className="input"
                placeholder="Full name"
                value={pForm.full_name}
                onChange={(e) =>
                  setPForm({ ...pForm, full_name: e.target.value })
                }
                required
              />
              <input
                className="input"
                placeholder="Employee code"
                value={pForm.emp_code}
                onChange={(e) =>
                  setPForm({ ...pForm, emp_code: e.target.value })
                }
              />
              <FancySelect
                placeholder="Department"
                options={deps.map((d) => ({ value: d.id, label: d.name }))}
                value={pForm.department_id || ""}
                onChange={(v) =>
                  setPForm({ ...pForm, department_id: v || null })
                }
              />
              <input
                className="input"
                placeholder="Email"
                value={pForm.email}
                onChange={(e) =>
                  setPForm({ ...pForm, email: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Phone"
                value={pForm.phone}
                onChange={(e) =>
                  setPForm({ ...pForm, phone: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Status (active/left…)"
                value={pForm.status}
                onChange={(e) =>
                  setPForm({ ...pForm, status: e.target.value })
                }
              />
              <div className="btn-row">
                <button className="btn primary">
                  {pForm.id ? "Update" : "Add"}
                </button>
                {pForm.id && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setPForm(emptyP)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="divider" />

            <div
              className="toolbar"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <div className="control" style={{ width: 320 }}>
                <input
                  className="input"
                  placeholder="Search people (name, code, dept)…"
                  value={qPeople}
                  onChange={(e) => setQPeople(e.target.value)}
                />
              </div>

              {/* CSV import button (light green) */}
              <button
                type="button"
                className="btn"
                style={{
                  backgroundColor: "#bbf7d0",
                  color: "#166534",
                  marginLeft: "auto",
                }}
                onClick={() => setCsvModal("people")}
              >
                Import CSV
              </button>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Dept</th>
                    <th>Code</th>
                    <th className="t-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPeople.map((p) => (
                    <tr key={p.id}>
                      <td>{p.full_name}</td>
                      <td>{p.department_name || "—"}</td>
                      <td className="mono">{p.emp_code || "—"}</td>
                      <td className="t-right">
                        <div className="btn-row">
                          <button
                            className="btn ghost"
                            onClick={() => onPersonEdit(p)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => onPersonDelete(p)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPeople.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No people
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {renderPager({
              total: filteredPeople.length,
              page: peoplePage,
              pageSize: peoplePageSize,
              onPageChange: setPeoplePage,
              onPageSizeChange: setPeoplePageSize,
            })}
          </div>
        </div>

        {/* Items */}
        <div className="card card-elev">
          <div className="card-head">
            <h3>Items</h3>
          </div>
          <div className="card-body">
            <form onSubmit={onItemSubmit} className="stack">
              <input
                className="input"
                placeholder="Name"
                value={iForm.name}
                onChange={(e) =>
                  setIForm({ ...iForm, name: e.target.value })
                }
                required
              />
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Quantity"
                value={iForm.quantity}
                onChange={(e) =>
                  setIForm({
                    ...iForm,
                    quantity: Number(e.target.value || 0),
                  })
                }
              />
              <input
                className="input"
                placeholder="Serial no."
                value={iForm.serial_no}
                onChange={(e) =>
                  setIForm({ ...iForm, serial_no: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Model no."
                value={iForm.model_no}
                onChange={(e) =>
                  setIForm({ ...iForm, model_no: e.target.value })
                }
              />

              <select
                className="input"
                value={iForm.category}
                onChange={(e) =>
                  setIForm({ ...iForm, category: e.target.value })
                }
              >
                <option value="Desktop">Desktop</option>
                <option value="Laptop">Laptop</option>
                <option value="Printer">Printer</option>
                <option value="UPS">UPS</option>
                <option value="Other">Other</option>
              </select>

              <input
                className="input"
                placeholder="Department (text)"
                value={iForm.department}
                onChange={(e) =>
                  setIForm({ ...iForm, department: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Owner (text)"
                value={iForm.owner}
                onChange={(e) =>
                  setIForm({ ...iForm, owner: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Notes"
                value={iForm.notes}
                onChange={(e) =>
                  setIForm({ ...iForm, notes: e.target.value })
                }
              />
              <div className="btn-row">
                <button className="btn primary">
                  {iForm.item_id ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIForm(emptyI)}
                >
                  Clear
                </button>
              </div>
            </form>

            <div className="divider" />

            <div
              className="toolbar"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <div className="control" style={{ width: 320 }}>
                <input
                  className="input"
                  placeholder="Search items (serial, model, name, id)…"
                  value={qItems}
                  onChange={(e) => setQItems(e.target.value)}
                />
              </div>

              {/* CSV import button (light green) */}
              <button
                type="button"
                className="btn"
                style={{
                  backgroundColor: "#bbf7d0",
                  color: "#166534",
                  marginLeft: "auto",
                }}
                onClick={() => setCsvModal("items")}
              >
                Import CSV
              </button>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr>
                    <th>Serial No.</th>
                    <th>Name</th>
                    <th>Qty</th>
                    <th className="t-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((it) => (
                    <tr key={it.item_id}>
                      <td className="mono">{it.serial_no || "—"}</td>
                      <td>{it.name}</td>
                      <td>{it.quantity}</td>
                      <td className="t-right">
                        <div className="btn-row">
                          <button
                            className="btn ghost"
                            onClick={() => onItemEdit(it)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => onItemDelete(it.item_id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {renderPager({
              total: filteredItems.length,
              page: itemsPage,
              pageSize: itemsPageSize,
              onPageChange: setItemsPage,
              onPageSizeChange: setItemsPageSize,
            })}
          </div>
        </div>
      </div>

      {/* Hidden CSV file inputs */}
      <input
        type="file"
        accept=".csv"
        ref={peopleCsvInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importPeopleFromCsv(file);
          e.target.value = "";
          setCsvModal(null);
        }}
      />
      <input
        type="file"
        accept=".csv"
        ref={itemsCsvInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importItemsFromCsv(file);
          e.target.value = "";
          setCsvModal(null);
        }}
      />

      {/* Active-equipment popup */}
      {deletePersonModal && (
        <div className="modal on">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Cannot delete {deletePersonModal.person.full_name}</h3>
              <button
                className="icon"
                onClick={() => setDeletePersonModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginBottom: 8 }}>
                {deletePersonModal.message}
              </p>

              {deletePersonModal.activeItems.length > 0 ? (
                <>
                  <p style={{ marginBottom: 4 }}>
                    The following items are still assigned to this person:
                  </p>
                  <ul className="list" style={{ marginBottom: 12 }}>
                    {deletePersonModal.activeItems.map((ai) => (
                      <li key={ai.assignment_id}>
                        <strong>{ai.item_id}</strong> –{" "}
                        {ai.item_name || "Unnamed item"}{" "}
                        {ai.serial_no && (
                          <span className="mono">({ai.serial_no})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="muted">
                    Please transfer these items to another person or back
                    to the available equipment pool (via the
                    <strong> Assignments</strong> /{" "}
                    <strong>Items</strong> screens), then try
                    deleting the person again.
                  </p>
                </>
              ) : (
                <p className="muted">
                  This person appears to have active equipment assigned.
                  Please transfer or return those items before deleting.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn primary"
                onClick={() => setDeletePersonModal(null)}
              >
                OK, I’ll transfer them
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV format help modal */}
      {csvModal && (
        <div className="modal on">
          <div className="modal-card">
            <div className="modal-head">
              <h3>
                Import {csvModal === "people" ? "People" : "Items"} from CSV
              </h3>
              <button className="icon" onClick={() => setCsvModal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {csvModal === "people" ? (
                <>
                  <p className="muted">
                    Upload a CSV file with a header row. The following
                    columns are supported:
                  </p>
                  <ul className="list">
                    <li>
                      <code>full_name</code>{" "}
                      <strong>(required)</strong> – or <code>name</code>
                    </li>
                    <li>
                      <code>emp_code</code> – or <code>code</code>
                    </li>
                    <li>
                      <code>department</code> – or <code>dept</code>{" "}
                      (matched against department <em>name</em>)
                    </li>
                    <li>
                      <code>email</code>, <code>phone</code>,{" "}
                      <code>status</code>
                    </li>
                  </ul>
                  <p style={{ marginTop: 8, marginBottom: 4 }}>
                    Example header:
                  </p>
                  <pre className="code" style={{ whiteSpace: "pre-wrap" }}>
full_name,emp_code,department,email,phone,status
                  </pre>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Extra columns are ignored. Avoid commas inside values.
                  </p>
                </>
              ) : (
                <>
                  <p className="muted">
                    Upload a CSV file with a header row for items. The
                    following columns are supported:
                  </p>
                  <ul className="list">
                    <li>
                      <code>name</code>{" "}
                      <strong>(required)</strong>
                    </li>
                    <li>
                      <code>quantity</code> – or <code>qty</code>
                    </li>
                    <li>
                      <code>serial_no</code> – or <code>serial</code>
                    </li>
                    <li>
                      <code>model_no</code> – or <code>model</code>
                    </li>
                    <li>
                      <code>category</code> – one of{" "}
                      <code>Desktop</code>, <code>Laptop</code>,{" "}
                      <code>Printer</code>, <code>UPS</code>,{" "}
                      <code>Other</code> (defaults to{" "}
                      <code>Other</code>)
                    </li>
                    <li>
                      <code>department</code> – or <code>dept</code>{" "}
                      (plain text)
                    </li>
                    <li>
                      <code>owner</code>, <code>notes</code>
                    </li>
                  </ul>
                  <p style={{ marginTop: 8, marginBottom: 4 }}>
                    Example header:
                  </p>
                  <pre className="code" style={{ whiteSpace: "pre-wrap" }}>
name,quantity,serial_no,model_no,category,department,owner,notes
                  </pre>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Extra columns are ignored. Avoid commas inside values.
                  </p>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setCsvModal(null)}>
                Cancel
              </button>
              {csvModal === "people" ? (
                <button
                  className="btn primary"
                  onClick={() => peopleCsvInputRef.current?.click()}
                >
                  Choose CSV file…
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => itemsCsvInputRef.current?.click()}
                >
                  Choose CSV file…
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
