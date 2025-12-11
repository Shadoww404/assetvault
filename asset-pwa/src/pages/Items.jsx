// src/pages/Items.jsx
import { useEffect, useRef, useState } from "react";
import {
  createItem,
  uploadPhotos,
  listPhotos,
  deletePhoto,
  listDepartments,
  listPeople,
  searchItems,
  searchItemsLite,
  transferAssignment,
  getActiveAssignment,
} from "../api";
import errorText from "../ui/errorText";
import FancySelect from "../ui/FancySelect.jsx";

function cx(...a) { return a.filter(Boolean).join(" "); }

export default function ItemsPage() {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");

  const [deps, setDeps] = useState([]);
  const [depId, setDepId] = useState("");

  const [ownerQ, setOwnerQ] = useState("");
  const [ownerOpts, setOwnerOpts] = useState([]);
  const [ownerPick, setOwnerPick] = useState(null);

  const [createdId, setCreatedId] = useState("");
  const [photos, setPhotos] = useState([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const addPhotosCoreRef = useRef(null);
  const addPhotosTransferRef = useRef(null);

  const [tSerial, setTSerial] = useState("");
  const [tEquipName, setTEquipName] = useState("");
  const [tFromQ, setTFromQ] = useState("");
  const [tFromOpts, setTFromOpts] = useState([]);
  const [tFrom, setTFrom] = useState(null);
  const [tToQ, setTToQ] = useState("");
  const [tToOpts, setTToOpts] = useState([]);
  const [tTo, setTTo] = useState(null);
  const [tDue, setTDue] = useState("");
  const [tNotes, setTNotes] = useState("");
  const [tItemResolved, setTItemResolved] = useState(null);
  const [tBusy, setTBusy] = useState(false);
  const [tFromResolvedLabel, setTFromResolvedLabel] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await listDepartments();
        setDeps(data);
      } catch {}
    })();
  }, []);

  // --- Owner typeahead
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!ownerQ || ownerQ.length < 2) { setOwnerOpts([]); return; }
      try {
        const { data } = await listPeople({ q: ownerQ, limit: 8 });
        setOwnerOpts(data);
      } catch {}
    }, 220);
    return () => clearTimeout(timer);
  }, [ownerQ]);

  useEffect(() => {
    if (!ownerPick) return;
    const match = deps.find(d => d.name === ownerPick.department_name);
    if (match) setDepId(match.id);
  }, [ownerPick, deps]);

  useEffect(() => {
    if (!createdId) return;
    (async () => {
      try {
        const { data } = await listPhotos(createdId);
        setPhotos(data);
      } catch {}
    })();
  }, [createdId]);

  async function resolveItemBySerial(serialNo) {
    if (!serialNo) return null;
    const { data } = await searchItems(serialNo);
    const exact = data.find(x => (x.serial_no || "").toLowerCase() === serialNo.toLowerCase());
    if (exact) return { item_id: exact.item_id, name: exact.name };
    if (data[0]) return { item_id: data[0].item_id, name: data[0].name };
    return null;
  }

  const onCreate = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("quantity", String(qty || 0));
      fd.set("serial_no", serial.trim());
      if (model.trim())  fd.set("model_no", model.trim());
      const depName = deps.find(d => d.id === depId)?.name || "";
      if (depName) fd.set("department", depName);
      if (ownerPick) fd.set("owner", ownerPick.full_name);
      else if (ownerQ.trim()) fd.set("owner", ownerQ.trim());
      if (notes.trim()) fd.set("notes", notes.trim());

      const { data } = await createItem(fd);
      setCreatedId(data.item_id);
      setName(""); setQty(1); setSerial(""); setModel("");
      setOwnerPick(null); setOwnerQ("");
    } catch (e2) {
      setErr(errorText(e2, "Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const onUploadCore = async (files) => {
    if (!createdId || !files?.length) return;
    setBusy(true);
    try {
      await uploadPhotos(createdId, files);
      const { data } = await listPhotos(createdId);
      setPhotos(data);
    } catch (e2) {
      setErr(errorText(e2, "Photo upload failed"));
    } finally {
      setBusy(false);
    }
  };

  const onDeletePhoto = async (pid) => {
    if (!createdId) return;
    setBusy(true);
    try {
      await deletePhoto(createdId, pid);
      const { data } = await listPhotos(createdId);
      setPhotos(data);
    } catch (e2) {
      setErr(errorText(e2, "Delete failed"));
    } finally {
      setBusy(false);
    }
  };

  // ----- Transfer: typeaheads -----
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!tFromQ || tFromQ.length < 2) { setTFromOpts([]); return; }
      try {
        const { data } = await listPeople({ q: tFromQ, limit: 8 });
        setTFromOpts(data);
      } catch {}
    }, 220);
    return () => clearTimeout(timer);
  }, [tFromQ]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!tToQ || tToQ.length < 2) { setTToOpts([]); return; }
      try {
        const { data } = await listPeople({ q: tToQ, limit: 8 });
        setTToOpts(data);
      } catch {}
    }, 220);
    return () => clearTimeout(timer);
  }, [tToQ]);

  // Resolve item + current holder whenever serial changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!tSerial) { setTItemResolved(null); setTFromResolvedLabel(""); return; }
      try {
        const found = await resolveItemBySerial(tSerial.trim());
        setTItemResolved(found);
        if (found) {
          const { data } = await getActiveAssignment(found.item_id);
          setTFromResolvedLabel(data?.person_name || "");
        } else {
          setTFromResolvedLabel("");
        }
        if (found && !tEquipName) setTEquipName(found.name || "");
      } catch {
        setTItemResolved(null);
        setTFromResolvedLabel("");
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [tSerial]); // eslint-disable-line

  const onTransfer = async (e) => {
    e.preventDefault();
    setErr(""); setTBusy(true);
    try {
      await transferAssignment({
        serial_no: tSerial.trim(),
        from_person_id: tFrom?.id,
        to_person_id: tTo?.id,
        due_back_date: tDue || null,
        notes: tNotes || null,
        item_name_for_log: tEquipName || null,
      });

      setTTo(null); setTToQ(""); setTFrom(null); setTFromQ("");
      setTDue(""); setTNotes("");
      if (tItemResolved?.item_id) {
        const { data } = await getActiveAssignment(tItemResolved.item_id);
        setTFromResolvedLabel(data?.person_name || "");
      }
    } catch (e2) {
      setErr(errorText(e2, "Transfer failed"));
    } finally {
      setTBusy(false);
    }
  };

  const onUploadTransfer = async (files) => {
    if (!files?.length) return;
    try {
      let targetId = tItemResolved?.item_id;
      if (!targetId && tSerial) {
        const found = await resolveItemBySerial(tSerial.trim());
        targetId = found?.item_id;
      }
      if (!targetId) {
        setErr("Select/resolve an equipment (by Serial) before adding photos.");
        return;
      }
      setTBusy(true);
      await uploadPhotos(targetId, files);
    } catch (e2) {
      setErr(errorText(e2, "Photo upload failed"));
    } finally {
      setTBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>New Asset</h1>
          <p className="muted">Create a new record and attach photos.</p>
        </div>
        {createdId && <div className="pill">ID: {createdId}</div>}
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* ---------------- Core Details Card ---------------- */}
      <div className={cx("card", "card-elev", busy && "disabled")}>
        <div className="card-head"><h3>Core details</h3></div>
        <div className="card-body">
          <form onSubmit={onCreate} className="grid-two">
            <div className="control">
              <label>Name *</label>
              <input className="input" required value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g., ThinkPad T14" />
            </div>
            <div className="control">
              <label>Serial No *</label>
              <input className="input" required value={serial} onChange={(e)=>setSerial(e.target.value)} placeholder="SN / Asset Tag" />
            </div>
            <div className="control">
              <label>Quantity</label>
              <input className="input" type="number" min="0" value={qty} onChange={(e)=>setQty(Number(e.target.value||0))} />
            </div>
            <div className="control">
              <label>Model No</label>
              <input className="input" value={model} onChange={(e)=>setModel(e.target.value)} placeholder="e.g., 20W0001SUS" />
            </div>

            <div className="control">
              <label>Department</label>
              <FancySelect
                placeholder="Pick department"
                options={deps.map(d => ({ value: d.id, label: d.name }))}
                value={depId}
                onChange={setDepId}
              />
            </div>
            <div className="control">
              <label>Owner</label>
              <div className="typeahead">
                <input
                  className="input"
                  value={ownerPick ? ownerPick.full_name : ownerQ}
                  onChange={(e)=>{ setOwnerQ(e.target.value); setOwnerPick(null); }}
                  placeholder="type a name or code..."
                  autoComplete="off"
                />
                {!ownerPick && ownerQ && ownerOpts.length > 0 && (
                  <div className="menu">
                    {ownerOpts.map(p => (
                      <button key={p.id} type="button" className="menu-item"
                        onClick={()=>{ setOwnerPick(p); setOwnerQ(""); setOwnerOpts([]); }}>
                        <div>{p.full_name}</div>
                        <div className="muted">{p.department_name || p.emp_code || ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="control full">
              <label>Notes & Photos</label>
              <input className="input" value={notes} onChange={(e)=>setNotes(e.target.value)}
                     placeholder="Condition, warranty, handover, etc." />
            </div>

            <div className="control full btn-row">
              <button className="btn primary">Save</button>

              <input ref={addPhotosCoreRef} type="file" accept="image/*" multiple hidden
                     onChange={(e)=>onUploadCore(Array.from(e.target.files||[]))}/>
              <button type="button" className="btn"
                      disabled={!createdId}
                      title={createdId ? "Attach photos to this new asset" : "Save asset first"}
                      onClick={()=>addPhotosCoreRef.current?.click()}>
                Add photos
              </button>
            </div>
          </form>

          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map(p => (
                <div key={p.id} className="photo-tile">
                  <img src={p.photo_url} alt="" />
                  <button className="icon danger" onClick={()=>onDeletePhoto(p.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Quick Transfer Card ---------------- */}
      <div className={cx("card", "card-elev", tBusy && "disabled")} style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Quick Transfer</h3></div>
        <div className="card-body">
          <form onSubmit={onTransfer} className="grid-two">
            <div className="control">
              <label>Serial No *</label>
              <input className="input" required value={tSerial} onChange={(e)=>setTSerial(e.target.value)} placeholder="Type item id / serial / name..." />
            </div>

            <div className="control">
              <label>Equipment name</label>
              <input className="input" value={tEquipName} onChange={(e)=>setTEquipName(e.target.value)} placeholder="optional (for audit detail)" />
            </div>

            <div className="control">
              <label>From</label>
              <div className="typeahead">
                <input className="input"
                  value={tFrom ? tFrom.full_name : tFromQ}
                  onChange={(e)=>{ setTFrom(null); setTFromQ(e.target.value); }}
                  placeholder='Pick a person'
                  autoComplete="off" />
                {!tFrom && tFromQ && tFromOpts.length > 0 && (
                  <div className="menu">
                    {tFromOpts.map(p => (
                      <button key={p.id} type="button" className="menu-item"
                              onClick={()=>{ setTFrom(p); setTFromQ(""); setTFromOpts([]); }}>
                        <div>{p.full_name}</div>
                        <div className="muted">{p.department_name || p.emp_code || ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!!tFromResolvedLabel && (
                <div className="muted" style={{marginTop:6}}>Currently assigned to: <b>{tFromResolvedLabel}</b></div>
              )}
            </div>

            <div className="control">
              <label>To person</label>
              <div className="typeahead">
                <input className="input"
                  value={tTo ? tTo.full_name : tToQ}
                  onChange={(e)=>{ setTTo(null); setTToQ(e.target.value); }}
                  placeholder='e.g., "IT Repairs" or a person name' autoComplete="off" />
                {!tTo && tToQ && tToOpts.length > 0 && (
                  <div className="menu">
                    {tToOpts.map(p => (
                      <button key={p.id} type="button" className="menu-item"
                              onClick={()=>{ setTTo(p); setTToQ(""); setTToOpts([]); }}>
                        <div>{p.full_name}</div>
                        <div className="muted">{p.department_name || p.emp_code || ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="control">
              <label>New due date (optional)</label>
              <input className="input" type="date" value={tDue} onChange={(e)=>setTDue(e.target.value)} />
            </div>

            <div className="control">
              <label>Notes</label>
              <input className="input" value={tNotes} onChange={(e)=>setTNotes(e.target.value)} placeholder="optional..." />
            </div>

            <div className="control full btn-row">
              <button className="btn primary" disabled={!tSerial || !tFrom || !tTo}>Transfer</button>

              <input ref={addPhotosTransferRef} type="file" accept="image/*" multiple hidden
                     onChange={(e)=>onUploadTransfer(Array.from(e.target.files||[]))}/>
              <button type="button" className="btn"
                      title="Attach photos to the selected equipment"
                      onClick={()=>addPhotosTransferRef.current?.click()}>
                Add photos
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
