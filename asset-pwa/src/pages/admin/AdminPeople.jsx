// src/pages/admin/AdminPeople.jsx
import { useEffect, useState } from "react";
import {
  listPeople,
  listDepartments,
  createPerson,
  updatePerson,
  deletePerson,
} from "../../api";
import errorText from "../../ui/errorText";
import FancySelect from "../../ui/FancySelect.jsx";

function cls(...c) {
  return c.filter(Boolean).join(" ");
}

export default function AdminPeople() {
  const [deps, setDeps] = useState([]);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // person or null

  // delete dialog state
  const [deleteDialog, setDeleteDialog] = useState(null);
  /*
    deleteDialog = {
      person,
      message: string,
      activeItems: [
        { assignment_id, item_id, item_name, serial_no }
      ]
    }
  */

  const load = async () => {
    try {
      setErr("");
      const [{ data: d }, { data: p }] = await Promise.all([
        listDepartments(),
        listPeople({ q: q || undefined, limit: 200 }),
      ]);
      setDeps(d);
      setPeople(p);
    } catch (e) {
      setErr(errorText(e, "Failed to load people/departments"));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onSave = async (form) => {
    try {
      setErr("");
      if (editing?.id) {
        await updatePerson(editing.id, form);
      } else {
        await createPerson(form);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setErr(errorText(e, "Save failed"));
    }
  };

  const onDeleteClick = async (person) => {
    // first lightweight confirm
    const ok = window.confirm(
      `Are you sure you want to delete "${person.full_name}"?`
    );
    if (!ok) return;

    try {
      setErr("");
      await deletePerson(person.id);
      // deleted OK
      setDeleteDialog(null);
      await load();
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.detail;

      if (status === 409 && detail && typeof detail === "object") {
        // Structured "still has equipment" response from backend
        const message =
          typeof detail.message === "string"
            ? detail.message
            : "This person still has active equipment assigned.";
        const activeItems = Array.isArray(detail.active_items)
          ? detail.active_items
          : [];

        setDeleteDialog({
          person,
          message,
          activeItems,
        });
        return;
      }

      // generic error
      setErr(errorText(e, "Delete failed"));
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">People</h3>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="Search by name or code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="btn primary"
            onClick={() => setEditing({ full_name: "", status: "active" })}
          >
            Add person
          </button>
        </div>
      </div>

      <div className="card-body">
        {err && <div className="alert error">{err}</div>}

        <div className="table-wrap">
          <table className="table table-modern">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Department</th>
                <th>Status</th>
                <th className="t-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No people found
                  </td>
                </tr>
              ) : (
                people.map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td className="mono">{p.emp_code || "—"}</td>
                    <td>{p.department_name || "—"}</td>
                    <td>{p.status || "active"}</td>
                    <td className="t-right">
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn ghost sm"
                          onClick={() => setEditing(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn danger sm"
                          onClick={() => onDeleteClick(p)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {editing && (
          <EditPersonModal
            deps={deps}
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={onSave}
          />
        )}

        {deleteDialog && (
          <DeletePersonModal
            dialog={deleteDialog}
            onClose={() => setDeleteDialog(null)}
          />
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

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="modal on">
      <div className="modal-card">
        <div className="modal-head">
          <h3>{initial.id ? "Edit person" : "Add person"}</h3>
          <button className="icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body grid-two">
          <label className="control">
            Full name
            <input
              className="input"
              value={form.full_name}
              onChange={(e) => setField("full_name", e.target.value)}
            />
          </label>
          <label className="control">
            Emp code
            <input
              className="input"
              value={form.emp_code}
              onChange={(e) => setField("emp_code", e.target.value)}
            />
          </label>
          <label className="control">
            Department
            <select
              className="input"
              value={form.department_id ?? ""}
              onChange={(e) =>
                setField("department_id", e.target.value || null)
              }
            >
              <option value="">—</option>
              {deps.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            Email
            <input
              className="input"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </label>
          <label className="control">
            Phone
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
            />
          </label>
          <label className="control">
            Status
            <select
              className="input"
              value={form.status}
              onChange={(e) => setField("status", e.target.value)}
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave(form)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletePersonModal({ dialog, onClose }) {
  const { person, message, activeItems } = dialog;

  return (
    <div className="modal on">
      <div className="modal-card">
        <div className="modal-head">
          <h3>Cannot delete person</h3>
          <button className="icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ marginBottom: 8 }}>
            <strong>{person.full_name}</strong>
          </p>
          <p style={{ marginBottom: 12 }}>{message}</p>

          {activeItems && activeItems.length > 0 && (
            <>
              <p className="muted" style={{ marginBottom: 8 }}>
                The following items are still assigned:
              </p>
              <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
                <table className="table table-modern">
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Name</th>
                      <th>Serial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map((it) => (
                      <tr key={it.assignment_id}>
                        <td className="mono">{it.item_id}</td>
                        <td>{it.item_name || "—"}</td>
                        <td className="mono">{it.serial_no || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Please transfer or return these items (via the Assignments / Items
                pages) before deleting this person.
              </p>
            </>
          )}
        </div>
        <div className="modal-foot t-right">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
