// src/pages/admin/AdminPeople.jsx
import { useEffect, useState } from "react";
import { listPeople, listDepartments } from "../../api";
import { createPerson, updatePerson, archivePerson } from "../../api"; // add these to api.js
import FancySelect from "../../FancySelect.jsx";

export default function AdminPeople() {
  const [deps, setDeps] = useState([]);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // person or null
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const [{ data: d }, { data: p }] = await Promise.all([
        listDepartments(), listPeople({ q, limit: 200 }),
      ]);
      setDeps(d); setPeople(p);
    } catch (e) { setErr(e?.response?.data?.detail || "Failed to load"); }
  };
  useEffect(() => { load(); }, [q]);

  const onSave = async (form) => {
    try {
      if (editing?.id) await updatePerson(editing.id, form);
      else await createPerson(form);
      setEditing(null); await load();
    } catch (e) { setErr(e?.response?.data?.detail || "Save failed"); }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">People</h3>
        <div className="btn-row">
          <input className="input" placeholder="search…" value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn primary" onClick={()=>setEditing({full_name:""})}>Add</button>
        </div>
      </div>
      <div className="card-body">
        {err && <div className="alert error">{err}</div>}
        <table className="table table-modern">
          <thead>
            <tr><th>Name</th><th>Code</th><th>Department</th><th>Status</th><th className="t-right">Actions</th></tr>
          </thead>
          <tbody>
            {people.map(p=>(
              <tr key={p.id}>
                <td>{p.full_name}</td>
                <td className="mono">{p.emp_code || "—"}</td>
                <td>{p.department_name || "—"}</td>
                <td>{p.status || "active"}</td>
                <td className="t-right">
                  <div className="btn-row">
                    <button className="btn" onClick={()=>setEditing(p)}>Edit</button>
                    <button className="btn danger" onClick={async()=>{
                      if (!confirm(`Archive ${p.full_name}?`)) return;
                      await archivePerson(p.id); await load();
                    }}>Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editing && (
          <EditPersonModal deps={deps} initial={editing} onClose={()=>setEditing(null)} onSave={onSave} />
        )}
      </div>
    </div>
  );
}

function EditPersonModal({ deps, initial, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: initial.full_name || "",
    emp_code: initial.emp_code || "",
    department_id: initial.department_id || "",
    email: initial.email || "",
    phone: initial.phone || "",
    status: initial.status || "active",
  });
  const set = (k,v)=>setForm(s=>({...s,[k]:v}));
  return (
    <div className="modal on">
      <div className="modal-card">
        <div className="modal-head">
          <h3>{initial.id ? "Edit person" : "Add person"}</h3>
          <button className="icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body grid-two">
          <label className="control">Full name
            <input className="input" value={form.full_name} onChange={e=>set("full_name", e.target.value)} />
          </label>
          <label className="control">Emp code
            <input className="input" value={form.emp_code} onChange={e=>set("emp_code", e.target.value)} />
          </label>
          <label className="control">Department
            <select className="input" value={form.department_id ?? ""} onChange={e=>set("department_id", e.target.value || null)}>
              <option value="">—</option>
              {deps.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="control">Email
            <input className="input" value={form.email} onChange={e=>set("email", e.target.value)} />
          </label>
          <label className="control">Phone
            <input className="input" value={form.phone} onChange={e=>set("phone", e.target.value)} />
          </label>
          <label className="control">Status
            <select className="input" value={form.status} onChange={e=>set("status", e.target.value)}>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={()=>onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}
