// src/pages/admin/Admin.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listPeople, createPerson, updatePerson, deletePerson,
  listItems, createItem, updateItem, deleteItem,
} from "../../api";
import FancySelect from "../../ui/FancySelect.jsx";

export default function AdminPage() {
  // data
  const [deps, setDeps] = useState([]);
  const [people, setPeople] = useState([]);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  // per-table searches
  const [pQ, setPQ] = useState("");
  const [iQ, setIQ] = useState("");
  const peopleSearchRef = useRef(null);
  const itemsSearchRef  = useRef(null);

  // forms
  const [deptEdit, setDeptEdit] = useState(null);
  const [deptName, setDeptName] = useState("");

  const emptyP = { id:null, full_name:"", emp_code:"", department_id:"", email:"", phone:"", status:"" };
  const [pForm, setPForm] = useState(emptyP);

  const emptyI = { item_id:"", name:"", quantity:0, serial_no:"", model_no:"", department:"", owner:"", notes:"" };
  const [iForm, setIForm] = useState(emptyI);

  // load
  const refresh = async () => {
    setErr("");
    try {
      const [{data: d}, {data: ppl}, {data: it}] = await Promise.all([
        listDepartments(), listPeople({ limit: 500 }), listItems()
      ]);
      setDeps(d); setPeople(ppl); setItems(it);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load admin data");
    }
  };
  useEffect(() => { refresh(); }, []);

  // quick keyboard: focus people search with "p", items with "i"
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "p") peopleSearchRef.current?.focus();
      if (e.key.toLowerCase() === "i") itemsSearchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // filter helpers
  const norm = (s) => (s || "").toString().toLowerCase();

  const peopleFiltered = useMemo(() => {
    const q = norm(pQ);
    if (!q) return people;
    return people.filter(p =>
      norm(p.full_name).includes(q) ||
      norm(p.emp_code).includes(q) ||
      norm(p.department_name).includes(q) ||
      norm(p.email).includes(q) ||
      norm(p.phone).includes(q) ||
      norm(p.status).includes(q)
    );
  }, [people, pQ]);

  const itemsFiltered = useMemo(() => {
    const q = norm(iQ);
    if (!q) return items;
    return items.filter(it =>
      norm(it.item_id).includes(q) ||
      norm(it.name).includes(q) ||
      norm(it.serial_no).includes(q) ||
      norm(it.model_no).includes(q) ||
      norm(it.owner).includes(q) ||
      norm(it.department).includes(q) ||
      norm(it.notes).includes(q)
    );
  }, [items, iQ]);

  // ----- Departments -----
  const onDeptSave = async (e) => {
    e.preventDefault();
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
    item_id: it.item_id, name: it.name || "", quantity: it.quantity || 0,
    serial_no: it.serial_no || "", model_no: it.model_no || "",
    department: it.department || "", owner: it.owner || "", notes: it.notes || ""
  });

  const onItemSubmit = async (e) => {
    e.preventDefault();
    const { item_id, ...rest } = iForm;
    try {
      if (items.find(x => x.item_id === item_id)) {
        await updateItem(item_id, rest);
      } else {
        const fd = new FormData();
        fd.set("item_id", item_id);
        fd.set("name", rest.name);
        fd.set("quantity", String(rest.quantity || 0));
        if (rest.serial_no) fd.set("serial_no", rest.serial_no);
        if (rest.model_no)  fd.set("model_no",  rest.model_no);
        if (rest.department) fd.set("department", rest.department);
        if (rest.owner) fd.set("owner", rest.owner);
        if (rest.notes) fd.set("notes", rest.notes);
        await createItem(fd);
      }
      setIForm(emptyI); await refresh();
    } catch (e2) { setErr(e2?.response?.data?.detail || "Item save failed"); }
  };

  const onItemDelete = async (id) => {
    if (!confirm(`Delete item ${id}?`)) return;
    try { await deleteItem(id); await refresh(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Item delete failed"); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">Manage departments, people and items.</p>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="grid three">
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
          <div className="card-head">
            <h3>People</h3>
            <div className="searchbar">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm11 18-5.1-5.1" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round"/>
              </svg>
              <input
                ref={peopleSearchRef}
                value={pQ}
                onChange={(e)=>setPQ(e.target.value)}
                placeholder="Search people…"
              />
              {pQ && <button className="clear" onClick={()=>setPQ("")}>✕</button>}
            </div>
          </div>

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
            <div className="table-wrap">
              <table className="table table-modern">
                <thead><tr><th>Name</th><th>Dept</th><th>Code</th><th className="t-right">Actions</th></tr></thead>
                <tbody>
                  {peopleFiltered.map(p => (
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
                  {peopleFiltered.length===0 && <tr><td colSpan={4} className="muted">No people</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card card-elev">
          <div className="card-head">
            <h3>Items</h3>
            <div className="searchbar">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm11 18-5.1-5.1" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round"/>
              </svg>
              <input
                ref={itemsSearchRef}
                value={iQ}
                onChange={(e)=>setIQ(e.target.value)}
                placeholder="Search items…"
              />
              {iQ && <button className="clear" onClick={()=>setIQ("")}>✕</button>}
            </div>
          </div>

          <div className="card-body">
            <form onSubmit={onItemSubmit} className="stack">
              <input className="input" placeholder="Item ID" value={iForm.item_id} onChange={(e)=>setIForm({...iForm, item_id:e.target.value})} required />
              <input className="input" placeholder="Name" value={iForm.name} onChange={(e)=>setIForm({...iForm, name:e.target.value})} required />
              <input className="input" type="number" min="0" placeholder="Quantity" value={iForm.quantity} onChange={(e)=>setIForm({...iForm, quantity: Number(e.target.value||0)})} />
              <input className="input" placeholder="Serial no." value={iForm.serial_no} onChange={(e)=>setIForm({...iForm, serial_no:e.target.value})} />
              <input className="input" placeholder="Model no." value={iForm.model_no} onChange={(e)=>setIForm({...iForm, model_no:e.target.value})} />
              <input className="input" placeholder="Department (text)" value={iForm.department} onChange={(e)=>setIForm({...iForm, department:e.target.value})} />
              <input className="input" placeholder="Owner (text)" value={iForm.owner} onChange={(e)=>setIForm({...iForm, owner:e.target.value})} />
              <input className="input" placeholder="Notes" value={iForm.notes} onChange={(e)=>setIForm({...iForm, notes:e.target.value})} />
              <div className="btn-row">
                <button className="btn primary">{items.find(x=>x.item_id===iForm.item_id) ? "Update" : "Create"}</button>
                <button type="button" className="btn" onClick={()=>setIForm(emptyI)}>Clear</button>
              </div>
            </form>

            <div className="divider" />
            <div className="table-wrap">
              <table className="table table-modern">
                <thead><tr><th>Item ID</th><th>Name</th><th>Qty</th><th className="t-right">Actions</th></tr></thead>
                <tbody>
                  {itemsFiltered.map(it => (
                    <tr key={it.item_id}>
                      <td className="mono">{it.item_id}</td>
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
                  {itemsFiltered.length===0 && <tr><td colSpan={4} className="muted">No items</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
