import { useRef, useState } from "react";
import { createItem, uploadPhotos } from "../api";

export default function Items() {
  const [form, setForm] = useState({
    item_id: "", name: "", quantity: 1, serial_no: "",
    model_no: "", department: "", owner: "",
    transfer_from: "", transfer_to: "", notes: "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const fileRef = useRef(null);

  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const room = Math.max(0, 5 - files.length);
    const take = incoming.slice(0, room);
    const urls = take.map((f) => URL.createObjectURL(f));
    setFiles((f) => [...f, ...take]);
    setPreviews((p) => [...p, ...urls]);
  };

  const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); };
  const onRemove = (idx) => {
    const url = previews[idx]; try { URL.revokeObjectURL(url); } catch {}
    setPreviews((p) => p.filter((_, i) => i !== idx));
    setFiles((f) => f.filter((_, i) => i !== idx));
  };

  const validate = () => {
    const errs = {};
    if (!form.item_id?.trim()) errs.item_id = "Item ID is required";
    if (!form.name?.trim()) errs.name = "Name is required";
    if (String(form.quantity).trim() === "" || Number(form.quantity) < 0) errs.quantity = "Quantity must be 0+";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const reset = () => {
    setForm({ item_id:"", name:"", quantity:1, serial_no:"", model_no:"", department:"", owner:"", transfer_from:"", transfer_to:"", notes:"" });
    previews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    setPreviews([]); setFiles([]); setErrors({});
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      await createItem(fd);
      if (files.length) await uploadPhotos(form.item_id, files.slice(0, 5));
      setToast("Saved ✓"); setTimeout(() => setToast(""), 1600);
      reset();
    } finally { setSaving(false); }
  };

  return (
    <div className="add-wrap page-in">
      <header className="add-head">
        <div>
          <h2>New Asset</h2>
          <p className="muted">Create a new record and attach up to 5 photos.</p>
        </div>
        <div className="count"><span className="chip">{files.length}/5 photos</span></div>
      </header>

      <form className="add-form" onSubmit={onSubmit}>
        <section className="card section">
          <h4 className="section-title">Core details</h4>
          <div className="grid2">
            <div className={`field ${errors.item_id ? "error" : ""}`}>
              <label>Item ID *</label>
              <input value={form.item_id} onChange={(e)=>setField("item_id", e.target.value)} placeholder="e.g., LT-2025-001"/>
              {errors.item_id && <small className="err">{errors.item_id}</small>}
            </div>
            <div className={`field ${errors.name ? "error" : ""}`}>
              <label>Name *</label>
              <input value={form.name} onChange={(e)=>setField("name", e.target.value)} placeholder="e.g., ThinkPad T14"/>
              {errors.name && <small className="err">{errors.name}</small>}
            </div>
            <div className={`field ${errors.quantity ? "error" : ""}`}>
              <label>Quantity</label>
              <input type="number" min="0" value={form.quantity} onChange={(e)=>setField("quantity", e.target.value)}/>
              {errors.quantity && <small className="err">{errors.quantity}</small>}
            </div>
            <div className="field"><label>Serial No</label><input value={form.serial_no} onChange={(e)=>setField("serial_no", e.target.value)} placeholder="SN / Asset Tag"/></div>
            <div className="field"><label>Model No</label><input value={form.model_no} onChange={(e)=>setField("model_no", e.target.value)} placeholder="e.g., 20W0001SUS"/></div>
            <div className="field"><label>Department</label><input value={form.department} onChange={(e)=>setField("department", e.target.value)} placeholder="e.g., Finance"/></div>
            <div className="field"><label>Owner</label><input value={form.owner} onChange={(e)=>setField("owner", e.target.value)} placeholder="e.g., Jane Perera"/></div>
            <div className="field"><label>From (Transfer)</label><input value={form.transfer_from} onChange={(e)=>setField("transfer_from", e.target.value)} placeholder="e.g., Repair Center"/></div>
            <div className="field"><label>To (Transfer)</label><input value={form.transfer_to} onChange={(e)=>setField("transfer_to", e.target.value)} placeholder="e.g., IT Stores"/></div>
          </div>
        </section>

        <section className="card section">
          <h4 className="section-title">Notes & Photos</h4>
          <div className="field"><label>Notes</label>
            <textarea rows={5} value={form.notes} onChange={(e)=>setField("notes", e.target.value)} placeholder="Condition, warranty, handover, etc."/>
          </div>

          <div className="dropzone"
               onDrop={onDrop}
               onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
               onClick={()=>fileRef.current?.click()}
               role="button" tabIndex={0}
               onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" ") fileRef.current?.click(); }}
               aria-label="Upload photos">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e)=>addFiles(e.target.files)}/>
            <div className="dz-ico">📷</div>
            <div className="dz-text"><b>Drag & drop</b> images here, or <span className="link">browse</span><div className="muted">JPG/PNG/WebP · up to 5 photos</div></div>
          </div>

          {previews.length > 0 && (
            <div className="thumb-grid">
              {previews.map((src, i) => (
                <div className="thumb-item" key={src}>
                  <img src={src} alt={`photo ${i+1}`} />
                  <button type="button" className="btn ghost sm remove" onClick={() => onRemove(i)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="actions row end">
          <button type="button" className="btn" onClick={reset} disabled={saving}>Clear</button>
          <button type="submit" className={`btn primary ${saving ? "loading" : ""}`} disabled={saving}>
            {saving ? "Saving…" : "Save Item"}
          </button>
        </div>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
