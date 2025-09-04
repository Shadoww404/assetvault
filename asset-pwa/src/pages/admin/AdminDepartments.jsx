// src/pages/admin/AdminDepartments.jsx
import { useEffect, useState } from "react";
import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from "../../api";

export default function AdminDepartments() {
  const [deps, setDeps] = useState([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = async () => { try { setDeps((await listDepartments()).data); } catch(e){ setErr("Load failed"); } };
  useEffect(()=>{ load(); }, []);

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Departments</h3>
        <div className="btn-row">
          <input className="input" placeholder="New department…" value={name} onChange={e=>setName(e.target.value)} />
          <button className="btn primary" onClick={async()=>{
            if(!name.trim()) return;
            await createDepartment({name}); setName(""); await load();
          }}>Add</button>
        </div>
      </div>
      <div className="card-body">
        {err && <div className="alert error">{err}</div>}
        <table className="table table-modern">
          <thead><tr><th>Name</th><th className="t-right">Actions</th></tr></thead>
          <tbody>
            {deps.map(d=>(
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="t-right">
                  <div className="btn-row">
                    <button className="btn" onClick={async()=>{
                      const n = prompt("Rename department:", d.name);
                      if(n && n!==d.name){ await updateDepartment(d.id, {name:n}); await load(); }
                    }}>Rename</button>
                    <button className="btn danger" onClick={async()=>{
                      if(!confirm(`Delete ${d.name}?`)) return;
                      await deleteDepartment(d.id); await load();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
