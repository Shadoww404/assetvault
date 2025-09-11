// src/pages/admin/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listPeople, createPerson, updatePerson, deletePerson,
  listItems, createItem, updateItem, deleteItem,
  listUsers, createUser, updateUser, deleteUser,
} from "../../api";
import FancySelect from "../../ui/FancySelect.jsx";

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

  const emptyP = { id:null, full_name:"", emp_code:"", department_id:"", email:"", phone:"", status:"" };
  const [pForm, setPForm] = useState(emptyP);

  // Keep item_id in state (for edits/deletes), but DO NOT render an input for it.
  const emptyI = {
    item_id:"", // hidden/internal
    name:"", quantity:0, serial_no:"", model_no:"", department:"", owner:"", notes:""
  };
  const [iForm, setIForm] = useState(emptyI);

  const emptyU = { id:null, username:"", full_name:"", role:"staff", password:"" };
  const [uForm, setUForm] = useState(emptyU);

  // Load all
  const refresh = async () => {
    setErr(""); setBusy(true);
    try {
      const [{data: d}, {data: ppl}, {data: it}, {data: us}] = await Promise.all([
        listDepartments(), listPeople({ limit: 500 }), listItems(), listUsers()
      ]);
      setDeps(d); setPeople(ppl); setItems(it); setUsers(us);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load admin data");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  // Filters
  const filteredUsers = useMemo(() => {
    const q = qUsers.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.username || "").toLowerCase().includes(q) ||
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  }, [users, qUsers]);

  const filteredPeople = useMemo(() => {
    const q = qPeople.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p =>
      (p.full_name || "").toLowerCase().includes(q) ||
      (p.emp_code || "").toLowerCase().includes(q) ||
      (p.department_name || "").toLowerCase().includes(q)
    );
  }, [people, qPeople]);

  const filteredItems = useMemo(() => {
    const q = qItems.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      (it.serial_no || "").toLowerCase().includes(q) ||
      (it.model_no || "").toLowerCase().includes(q) ||
      (it.name || "").toLowerCase().includes(q) ||
      (it.item_id || "").toLowerCase().includes(q) // fallback
    );
  }, [items, qItems]);

  // ----- Departments -----
  const onDeptSave = async (e) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    try {
      if (deptEdit?.id) await updateDepartment(deptEdit.id, deptName.trim());
      else await createDepartment(deptName.trim());
      setDeptEdit(null); setDeptName(""); await refresh();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Dept save failed"); }
  };
  const onDeptEdit = (d) => { setDeptEdit(d); setDeptName(d.name); };
  const onDeptDelete = async (d) => {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try { await deleteDepartment(d.id); await refresh(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Dept delete failed"); }
  };

  // ----- People -----
  const onPersonEdit = (p) => setPForm({
    id: p.id, full_name: p.full_name || "", emp_code: p.emp_code || "",
    department_id: p.department_id || "", email: p.email || "",
    phone: p.phone || "", status: p.status || ""
  });
  const onPersonSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      full_name: pForm.full_name.trim(),
      emp_code: (pForm.emp_code||"").trim() || null,
      department_id: pForm.department_id || null,
      email: (pForm.email||"").trim() || null,
      phone: (pForm.phone||"").trim() || null,
      status: (pForm.status||"").trim() || null,
    };
    try {
      if (pForm.id) await updatePerson(pForm.id, payload);
      else await createPerson(payload);
      setPForm(emptyP); await refresh();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Person save failed"); }
  };
  const onPersonDelete = async (p) => {
    if (!confirm(`Delete ${p.full_name}?`)) return;
    try { await deletePerson(p.id); await refresh(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Person delete failed"); }
  };

  // ----- Items -----
  const onItemEdit = (it) => setIForm({
    item_id: it.item_id, // hidden/internal for updates/deletes only
    name: it.name || "", quantity: it.quantity || 0,
    serial_no: it.serial_no || "", model_no: it.model_no || "",
    department: it.department || "", owner: it.owner || "", notes: it.notes || ""
  });

  // Generate a safe item_id automatically (no manual typing)
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
    // Prefer serial_no for the ID base; fallback to model_no; then name
    const base = rest.serial_no || rest.model_no || rest.name || "item";
    for (let attempt = 0; attempt < 3; attempt++) {
      const newId = genItemId(base);
      const fd = new FormData();
      fd.set("item_id", newId);
      fd.set("name", rest.name);
      fd.set("quantity", String(rest.quantity || 0));
      if (rest.serial_no) fd.set("serial_no", rest.serial_no);
      if (rest.model_no)  fd.set("model_no",  rest.model_no);
      if (rest.department) fd.set("department", rest.department);
      if (rest.owner) fd.set("owner", rest.owner);
      if (rest.notes) fd.set("notes", rest.notes);
      try {
        await createItem(fd);
        return; // success
      } catch (e) {
        const code = e?.response?.status;
        const msg  = e?.response?.data?.detail || "";
        if (code === 409 && /already exists/i.test(msg)) {
          // collision: try again with a new suffix
          continue;
        }
        throw e; // another error: bubble up
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
        // UPDATE existing item (uses hidden item_id)
        await updateItem(item_id, rest);
      } else {
        // CREATE new item with auto-generated item_id (no manual field)
        await createItemWithAutoId(rest);
      }
      setIForm(emptyI); await refresh();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || e2?.message || "Item save failed");
    }
  };

  const onItemDelete = async (id) => {
    if (!confirm(`Delete item ${id}?`)) return;
    try { await deleteItem(id); await refresh(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Item delete failed"); }
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
      setUForm(emptyU); await refresh();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "User save failed");
    }
  };

  const onUserDelete = async (u) => {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try { await deleteUser(u.username); await refresh(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "User delete failed"); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">Manage users, departments, people and items.</p>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

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
                onChange={(e)=>setUForm({...uForm, username:e.target.value})}
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
                onChange={(e)=>setUForm({...uForm, full_name:e.target.value})}
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
                onChange={(v)=>setUForm({...uForm, role: v || "staff"})}
              />
            </div>
            <div className="stack">
              <label>{uForm.id ? "Reset password" : "Password"}</label>
              <input
                className="input"
                type="password"
                placeholder={uForm.id ? "leave blank to keep" : "set an initial password"}
                value={uForm.password}
                onChange={(e)=>setUForm({...uForm, password:e.target.value})}
              />
            </div>
            <div className="btn-row" style={{ gridColumn: "1 / -1" }}>
              <button className={`btn primary ${busy ? "loading":""}`} disabled={busy}>
                {uForm.id ? "Update user" : "Create user"}
              </button>
              {uForm.id && <button type="button" className="btn" onClick={()=>setUForm(emptyU)}>Cancel</button>}
            </div>
          </form>

          <div className="divider" />

          <div className="toolbar">
            <div className="control" style={{ width: 320 }}>
              <input
                className="input"
                placeholder="Search users (name, username, role)…"
                value={qUsers}
                onChange={(e)=>setQUsers(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrap">
            <table className="table table-modern">
              <thead>
                <tr><th>Username</th><th>Full name</th><th>Role</th><th className="t-right">Actions</th></tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td>{u.full_name || "—"}</td>
                    <td><span className="pill">{u.role}</span></td>
                    <td className="t-right">
                      <div className="btn-row">
                        <button className="btn ghost" onClick={()=>onUserEdit(u)}>Edit</button>
                        <button className="btn danger" onClick={()=>onUserDelete(u)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={4} className="muted">No users</td></tr>
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
          <div className="card-head"><h3>Departments</h3></div>
          <div className="card-body">
            <form onSubmit={onDeptSave} className="stack">
              <input className="input" value={deptName} onChange={(e)=>setDeptName(e.target.value)} placeholder="Department name" />
              <div className="btn-row">
                <button className="btn primary">{deptEdit ? "Update" : "Add"}</button>
                {deptEdit && <button type="button" className="btn" onClick={()=>{setDeptEdit(null); setDeptName("");}}>Cancel</button>}
              </div>
            </form>
            <div className="divider" />
            <table className="table table-modern">
              <thead><tr><th>Name</th><th className="t-right">Actions</th></tr></thead>
              <tbody>
                {deps.map(d => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="t-right">
                      <div className="btn-row">
                        <button className="btn ghost" onClick={()=>onDeptEdit(d)}>Edit</button>
                        <button className="btn danger" onClick={()=>onDeptDelete(d)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {deps.length===0 && <tr><td colSpan={2} className="muted">No departments</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* People */}
        <div className="card card-elev">
          <div className="card-head"><h3>People</h3></div>
          <div className="card-body">
            <form onSubmit={onPersonSubmit} className="stack">
              <input className="input" placeholder="Full name" value={pForm.full_name} onChange={(e)=>setPForm({...pForm, full_name:e.target.value})} required />
              <input className="input" placeholder="Employee code" value={pForm.emp_code} onChange={(e)=>setPForm({...pForm, emp_code:e.target.value})} />
              <FancySelect
                placeholder="Department"
                options={deps.map(d => ({ value: d.id, label: d.name }))}
                value={pForm.department_id || ""}
                onChange={(v)=>setPForm({...pForm, department_id: v || null})}
              />
              <input className="input" placeholder="Email" value={pForm.email} onChange={(e)=>setPForm({...pForm, email:e.target.value})} />
              <input className="input" placeholder="Phone" value={pForm.phone} onChange={(e)=>setPForm({...pForm, phone:e.target.value})} />
              <input className="input" placeholder="Status (active/left…)" value={pForm.status} onChange={(e)=>setPForm({...pForm, status:e.target.value})} />
              <div className="btn-row">
                <button className="btn primary">{pForm.id ? "Update" : "Add"}</button>
                {pForm.id && <button type="button" className="btn" onClick={()=>setPForm(emptyP)}>Cancel</button>}
              </div>
            </form>

            <div className="divider" />

            <div className="toolbar">
              <div className="control" style={{ width: 320 }}>
                <input
                  className="input"
                  placeholder="Search people (name, code, dept)…"
                  value={qPeople}
                  onChange={(e)=>setQPeople(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead><tr><th>Name</th><th>Dept</th><th>Code</th><th className="t-right">Actions</th></tr></thead>
                <tbody>
                  {filteredPeople.map(p => (
                    <tr key={p.id}>
                      <td>{p.full_name}</td>
                      <td>{p.department_name || "—"}</td>
                      <td className="mono">{p.emp_code || "—"}</td>
                      <td className="t-right">
                        <div className="btn-row">
                          <button className="btn ghost" onClick={()=>onPersonEdit(p)}>Edit</button>
                          <button className="btn danger" onClick={()=>onPersonDelete(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPeople.length===0 && <tr><td colSpan={4} className="muted">No people</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card card-elev">
          <div className="card-head"><h3>Items</h3></div>
          <div className="card-body">
            {/* NOTE: No "Item ID" input. We auto-generate it on create. */}
            <form onSubmit={onItemSubmit} className="stack">
              <input className="input" placeholder="Name" value={iForm.name} onChange={(e)=>setIForm({...iForm, name:e.target.value})} required />
              <input className="input" type="number" min="0" placeholder="Quantity" value={iForm.quantity} onChange={(e)=>setIForm({...iForm, quantity: Number(e.target.value||0)})} />
              <input className="input" placeholder="Serial no." value={iForm.serial_no} onChange={(e)=>setIForm({...iForm, serial_no:e.target.value})} />
              <input className="input" placeholder="Model no." value={iForm.model_no} onChange={(e)=>setIForm({...iForm, model_no:e.target.value})} />
              <input className="input" placeholder="Department (text)" value={iForm.department} onChange={(e)=>setIForm({...iForm, department:e.target.value})} />
              <input className="input" placeholder="Owner (text)" value={iForm.owner} onChange={(e)=>setIForm({...iForm, owner:e.target.value})} />
              <input className="input" placeholder="Notes" value={iForm.notes} onChange={(e)=>setIForm({...iForm, notes:e.target.value})} />
              <div className="btn-row">
                <button className="btn primary">
                  {iForm.item_id ? "Update" : "Create"}
                </button>
                <button type="button" className="btn" onClick={()=>setIForm(emptyI)}>Clear</button>
              </div>
            </form>

            <div className="divider" />

            <div className="toolbar">
              <div className="control" style={{ width: 320 }}>
                <input
                  className="input"
                  placeholder="Search items (serial, model, name, id)…"
                  value={qItems}
                  onChange={(e)=>setQItems(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="table table-modern">
                <thead>
                  <tr><th>Serial No.</th><th>Name</th><th>Qty</th><th className="t-right">Actions</th></tr>
                </thead>
                <tbody>
                  {filteredItems.map(it => (
                    <tr key={it.item_id}>
                      <td className="mono">{it.serial_no || "—"}</td>
                      <td>{it.name}</td>
                      <td>{it.quantity}</td>
                      <td className="t-right">
                        <div className="btn-row">
                          <button className="btn ghost" onClick={()=>onItemEdit(it)}>Edit</button>
                          <button className="btn danger" onClick={()=>onItemDelete(it.item_id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length===0 && <tr><td colSpan={4} className="muted">No items</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
