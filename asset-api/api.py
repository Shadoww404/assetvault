# api.py
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import timedelta
import os, uuid, shutil

from db import get_conn
from security import (
    create_access_token, verify_password, hash_password, decode_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# --------------------------------------------------------------------------
# App / CORS / Static
# --------------------------------------------------------------------------
auth_scheme = HTTPBearer(auto_error=True)

app = FastAPI(title="AssetVault API", version="1.7")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|172\.\d+\.\d+\.\d+)(:\d+)?$|^https://.*\.trycloudflare\.com$",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

MAX_PHOTOS_PER_ITEM = 5

# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(auth_scheme)) -> Dict[str, Any]:
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    return {"username": payload.get("sub"), "role": payload.get("role", "staff")}

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user

# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: Optional[str] = "staff"

class PhotoOut(BaseModel):
    id: int
    photo_url: str

class ItemOut(BaseModel):
    item_id: str
    name: str
    quantity: int
    serial_no: Optional[str] = None
    model_no: Optional[str] = None
    department: Optional[str] = None
    owner: Optional[str] = None
    transfer_from: Optional[str] = None
    transfer_to: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    photo_url: Optional[str] = None
    photos: List[PhotoOut] = Field(default_factory=list)

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    serial_no: Optional[str] = None
    model_no: Optional[str] = None
    department: Optional[str] = None
    owner: Optional[str] = None
    transfer_from: Optional[str] = None
    transfer_to: Optional[str] = None
    notes: Optional[str] = None

class DepartmentOut(BaseModel):
    id: int
    name: str

class DepartmentIn(BaseModel):
    name: str

class PersonOut(BaseModel):
    id: int
    emp_code: Optional[str] = None
    full_name: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

class PersonIn(BaseModel):
    full_name: str
    emp_code: Optional[str] = None
    department_id: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

class AssignmentOut(BaseModel):
    id: int
    item_id: str
    item_name: Optional[str] = None
    person_id: int
    assigned_at: Optional[str] = None
    due_back_date: Optional[str] = None
    returned_at: Optional[str] = None
    notes: Optional[str] = None

class EntryOut(BaseModel):
    id: int
    event_time: str
    event: str
    item_id: str
    from_holder: Optional[str] = None
    to_holder: Optional[str] = None
    by_user: Optional[str] = None
    notes: Optional[str] = None

class ActiveAssignmentOut(BaseModel):
    id: int
    item_id: str
    item_name: Optional[str] = None
    person_id: int
    person_name: str

# --------------------------------------------------------------------------
# DB helpers
# --------------------------------------------------------------------------
SELECT_LIST = """
  item_id, name, quantity, serial_no, model_no, department, owner,
  transfer_from, transfer_to, notes, photo_url, created_by, created_at
"""

def _row_to_item(r) -> ItemOut:
    return ItemOut(
        item_id=r[0], name=r[1], quantity=int(r[2]),
        serial_no=r[3], model_no=r[4], department=r[5], owner=r[6],
        transfer_from=r[7], transfer_to=r[8], notes=r[9],
        photo_url=r[10], created_by=r[11],
        created_at=(r[12].strftime("%Y-%m-%d %H:%M:%S") if r[12] else None),
    )

def _fetch_item(conn, item_id: str) -> ItemOut:
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT {SELECT_LIST} FROM items WHERE item_id=%s", (item_id,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(404, "Item not found")
        obj = _row_to_item(r)
        obj.photos = get_item_photos(conn, obj.item_id)
        return obj
    finally:
        cur.close()

def get_item_photos(conn, item_id: str) -> List[PhotoOut]:
    cur = conn.cursor()
    cur.execute("SELECT id, photo_url FROM item_photos WHERE item_id=%s ORDER BY id", (item_id,))
    rows = cur.fetchall()
    cur.close()
    return [PhotoOut(id=r[0], photo_url=r[1]) for r in rows]

def fetch_person(conn, person_id: int) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT p.id, p.emp_code, p.full_name, p.department_id,
               d.name AS department_name
        FROM people p
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE p.id=%s
    """, (person_id,))
    row = cur.fetchone()
    cur.close()
    return row

def active_assignment(conn, item_id: str) -> Optional[Dict[str, Any]]:
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT id, item_id, person_id, assigned_at, due_back_date, returned_at, notes
        FROM assignments
        WHERE item_id=%s AND returned_at IS NULL
        ORDER BY id DESC LIMIT 1
    """, (item_id,))
    row = cur.fetchone()
    cur.close()
    return row

def person_label(p: Optional[Dict[str, Any]]) -> Optional[str]:
    if not p:
        return None
    code = (p.get("emp_code") or "").strip()
    name = (p.get("full_name") or "").strip()
    return f"{name} — {code}" if code else name

def log_entry(conn, event: str, item_id: str, frm: Optional[str], to: Optional[str],
              by_user: Optional[str], notes: Optional[str]) -> None:
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO entries(event_time, event, item_id, from_holder, to_holder, by_user, notes)
        VALUES (NOW(), %s, %s, %s, %s, %s, %s)
    """, (event, item_id, frm, to, by_user, notes))
    conn.commit()
    cur.close()

# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@app.post("/auth/register", response_model=TokenOut)
def register(user: UserCreate):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM users WHERE username=%s", (user.username,))
        if cur.fetchone():
            raise HTTPException(409, "Username already exists")
        cur.execute(
            "INSERT INTO users (username, password_hash, full_name, role) VALUES (%s,%s,%s,%s)",
            (user.username, hash_password(user.password), user.full_name, user.role or "staff"),
        )
        conn.commit()
    finally:
        cur.close(); conn.close()

    token = create_access_token({"sub": user.username, "role": user.role or "staff"},
                                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return TokenOut(access_token=token)

@app.post("/auth/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends()):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT password_hash, role FROM users WHERE username=%s", (form.username,))
        row = cur.fetchone()
        if not row or not verify_password(form.password, row[0]):
            raise HTTPException(401, "Incorrect username or password")
        role = row[1] or "staff"
    finally:
        cur.close(); conn.close()

    token = create_access_token({"sub": form.username, "role": role},
                                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return TokenOut(access_token=token)

@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return user

# --------------------------------------------------------------------------
# Items: list / search / get
# --------------------------------------------------------------------------
@app.get("/items", response_model=List[ItemOut])
def list_items(user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"SELECT {SELECT_LIST} FROM items ORDER BY created_at DESC, name")
    rows = cur.fetchall()
    data: List[ItemOut] = []
    for r in rows:
        obj = _row_to_item(r)
        obj.photos = get_item_photos(conn, obj.item_id)
        data.append(obj)
    cur.close(); conn.close()
    return data

@app.get("/items/search", response_model=List[ItemOut])
def search_items(q: str, user=Depends(get_current_user)):
    like = f"%{q}%"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT {SELECT_LIST} FROM items
        WHERE name LIKE %s OR item_id LIKE %s OR serial_no LIKE %s OR model_no LIKE %s
        ORDER BY created_at DESC, name
    """, (like, like, like, like))
    rows = cur.fetchall()
    data: List[ItemOut] = []
    for r in rows:
        obj = _row_to_item(r)
        obj.photos = get_item_photos(conn, obj.item_id)
        data.append(obj)
    cur.close(); conn.close()
    return data

@app.get("/items/{item_id}", response_model=ItemOut)
def get_item(item_id: str, user=Depends(get_current_user)):
    conn = get_conn()
    try:
        return _fetch_item(conn, item_id)
    finally:
        conn.close()

# --------------------------------------------------------------------------
# Items: create / update / delete
# --------------------------------------------------------------------------
@app.post("/items", status_code=201, response_model=ItemOut)
def create_item(
    item_id: Optional[str] = Form(None),         # optional
    name: str = Form(...),
    quantity: int = Form(0),
    serial_no: Optional[str] = Form(None),       # you said Serial is your main key
    model_no: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    iid = (item_id or "").strip()
    sn = (serial_no or "").strip()
    mn = (model_no or "").strip()
    if not iid:
        if sn:
            iid = sn
        elif mn:
            iid = mn
        else:
            iid = f"ITM-{uuid.uuid4().hex[:8].upper()}"

    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (iid,))
        if cur.fetchone():
            raise HTTPException(409, "An item with this identifier already exists")
        cur.execute("""
            INSERT INTO items
              (item_id, name, quantity, serial_no, model_no, department, owner,
               transfer_from, transfer_to, notes, photo_url, created_by, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,NULL,NULL,%s,NULL,%s,NOW())
        """, (iid, name, quantity, sn or None, mn or None, department, owner, notes, user["username"]))
        conn.commit()
        return _fetch_item(conn, iid)
    finally:
        cur.close(); conn.close()

@app.put("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: str, patch: ItemUpdate, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute(f"SELECT {SELECT_LIST} FROM items WHERE item_id=%s", (item_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Item not found")

        fields = {
            "name": patch.name if patch.name is not None else row["name"],
            "quantity": patch.quantity if patch.quantity is not None else row["quantity"],
            "serial_no": patch.serial_no if patch.serial_no is not None else row["serial_no"],
            "model_no": patch.model_no if patch.model_no is not None else row["model_no"],
            "department": patch.department if patch.department is not None else row["department"],
            "owner": patch.owner if patch.owner is not None else row["owner"],
            "transfer_from": patch.transfer_from if patch.transfer_from is not None else row["transfer_from"],
            "transfer_to": patch.transfer_to if patch.transfer_to is not None else row["transfer_to"],
            "notes": patch.notes if patch.notes is not None else row["notes"],
        }
        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE items SET
              name=%s, quantity=%s, serial_no=%s, model_no=%s, department=%s, owner=%s,
              transfer_from=%s, transfer_to=%s, notes=%s
            WHERE item_id=%s
        """, (fields["name"], fields["quantity"], fields["serial_no"], fields["model_no"],
              fields["department"], fields["owner"], fields["transfer_from"], fields["transfer_to"],
              fields["notes"], item_id))
        conn.commit()
        return _fetch_item(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM items WHERE item_id=%s", (item_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Item not found")
        return
    finally:
        cur.close(); conn.close()

# --------------------------------------------------------------------------
# Photos
# --------------------------------------------------------------------------
@app.post("/items/{item_id}/photo", response_model=ItemOut)
def upload_photo(item_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Please upload an image file")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join("uploads", filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    photo_url = f"/uploads/{filename}"
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("UPDATE items SET photo_url=%s WHERE item_id=%s", (photo_url, item_id))
        conn.commit()
        return _fetch_item(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.get("/items/{item_id}/photos", response_model=List[PhotoOut])
def list_photos(item_id: str, user=Depends(get_current_user)):
    conn = get_conn()
    try:
        return get_item_photos(conn, item_id)
    finally:
        conn.close()

@app.post("/items/{item_id}/photos", response_model=List[PhotoOut])
def add_photos(item_id: str, files: List[UploadFile] = File(...), user=Depends(get_current_user)):
    os.makedirs("uploads", exist_ok=True)
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM item_photos WHERE item_id=%s", (item_id,))
        existing = cur.fetchone()[0]

        to_insert = []
        for f in files:
            if not (f.content_type or "").startswith("image/"):
                continue
            ext = os.path.splitext(f.filename or "")[1].lower()
            if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
                ext = ".jpg"
            filename = f"{uuid.uuid4().hex}{ext}"
            path = os.path.join("uploads", filename)
            with open(path, "wb") as out:
                shutil.copyfileobj(f.file, out)
            to_insert.append(f"/uploads/{filename}")

        if existing + len(to_insert) > MAX_PHOTOS_PER_ITEM:
            for url in to_insert:
                try:
                    os.remove(os.path.join("uploads", url.rsplit("/", 1)[-1]))
                except Exception:
                    pass
            raise HTTPException(400, f"Max {MAX_PHOTOS_PER_ITEM} photos per item")

        for url in to_insert:
            cur.execute("INSERT INTO item_photos (item_id, photo_url) VALUES (%s,%s)", (item_id, url))
        conn.commit()
        return get_item_photos(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.delete("/items/{item_id}/photos/{photo_id}", status_code=204)
def delete_photo(item_id: str, photo_id: int, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT photo_url FROM item_photos WHERE id=%s AND item_id=%s", (photo_id, item_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Photo not found")
        url = row[0]
        cur.execute("DELETE FROM item_photos WHERE id=%s AND item_id=%s", (photo_id, item_id))
        conn.commit()
    finally:
        cur.close(); conn.close()

    try:
        fname = url.rsplit("/", 1)[-1]
        os.remove(os.path.join("uploads", fname))
    except Exception:
        pass
    return

# --------------------------------------------------------------------------
# People & Departments
# --------------------------------------------------------------------------
def row_to_person(r) -> PersonOut:
    return PersonOut(
        id=int(r[0]),
        emp_code=r[1],
        full_name=r[2],
        department_id=r[3],
        email=r[4],
        phone=r[5],
        status=r[6],
        department_name=r[7],
    )

def row_to_assignment(r) -> AssignmentOut:
    return AssignmentOut(
        id=int(r[0]),
        item_id=r[1],
        item_name=r[2],
        person_id=int(r[3]),
        assigned_at=r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
        due_back_date=r[5].strftime("%Y-%m-%d") if r[5] else None,
        returned_at=r[6].strftime("%Y-%m-%d %H:%M:%S") if r[6] else None,
        notes=r[7],
    )

@app.get("/departments", response_model=List[DepartmentOut])
def list_departments(user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM departments ORDER BY name ASC")
    data = [DepartmentOut(id=int(r[0]), name=r[1]) for r in cur.fetchall()]
    cur.close(); conn.close()
    return data

@app.post("/departments", response_model=DepartmentOut)
def create_department(body: DepartmentIn, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("INSERT INTO departments (name) VALUES (%s)", (body.name.strip(),))
        new_id = cur.lastrowid
        conn.commit()
        return DepartmentOut(id=int(new_id), name=body.name.strip())
    finally:
        cur.close(); conn.close()

@app.patch("/departments/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: int, body: DepartmentIn, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("UPDATE departments SET name=%s WHERE id=%s", (body.name.strip(), dept_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Department not found")
        conn.commit()
        return DepartmentOut(id=int(dept_id), name=body.name.strip())
    finally:
        cur.close(); conn.close()

@app.delete("/departments/{dept_id}", status_code=204)
def delete_department(dept_id: int, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM people WHERE department_id=%s LIMIT 1", (dept_id,))
        if cur.fetchone():
            raise HTTPException(409, "Department has people; reassign them first")
        cur.execute("DELETE FROM departments WHERE id=%s", (dept_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Department not found")
        conn.commit()
        return
    finally:
        cur.close(); conn.close()

@app.get("/people", response_model=List[PersonOut])
def list_people(dept_id: Optional[int] = None, q: Optional[str] = None, limit: int = 100,
                user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    sql = """
      SELECT p.id, p.emp_code, p.full_name, p.department_id, p.email, p.phone, p.status,
             d.name AS department_name
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE 1=1
    """
    args = []
    if dept_id:
        sql += " AND p.department_id=%s"
        args.append(dept_id)
    if q:
        like = f"%{q}%"
        sql += " AND (p.full_name LIKE %s OR p.emp_code LIKE %s)"
        args.extend([like, like])
    sql += " ORDER BY p.full_name ASC LIMIT %s"
    args.append(int(limit))
    cur.execute(sql, tuple(args))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [row_to_person(r) for r in rows]

@app.get("/people/{person_id}", response_model=PersonOut)
def get_person(person_id: int, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
      SELECT p.id, p.emp_code, p.full_name, p.department_id, p.email, p.phone, p.status,
             d.name AS department_name
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.id=%s
    """, (person_id,))
    r = cur.fetchone(); cur.close(); conn.close()
    if not r:
        raise HTTPException(404, "Person not found")
    return row_to_person(r)

@app.get("/people/{person_id}/history", response_model=List[AssignmentOut])
def get_person_history(person_id: int, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
      SELECT a.id, a.item_id, i.name AS item_name, a.person_id,
             a.assigned_at, a.due_back_date, a.returned_at, a.notes
      FROM assignments a
      LEFT JOIN items i ON i.item_id = a.item_id
      WHERE a.person_id=%s
      ORDER BY a.assigned_at DESC, a.id DESC
    """, (person_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [row_to_assignment(r) for r in rows]

@app.post("/people", response_model=PersonOut)
def create_person(body: PersonIn, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO people (full_name, emp_code, department_id, email, phone, status)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (body.full_name.strip(), body.emp_code, body.department_id, body.email, body.phone, body.status or "active"))
        new_id = cur.lastrowid
        conn.commit()
    finally:
        cur.close(); conn.close()
    return get_person(new_id)

@app.patch("/people/{person_id}", response_model=PersonOut)
def update_person(person_id: int, body: PersonIn, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE people
               SET full_name=%s, emp_code=%s, department_id=%s, email=%s, phone=%s, status=%s
             WHERE id=%s
        """, (body.full_name.strip(), body.emp_code, body.department_id, body.email, body.phone, body.status or "active", person_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Person not found")
        conn.commit()
    finally:
        cur.close(); conn.close()
    return get_person(person_id)

@app.delete("/people/{person_id}", status_code=204)
def delete_person(person_id: int, _admin=Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM assignments WHERE person_id=%s LIMIT 1", (person_id,))
        if cur.fetchone():
            raise HTTPException(400, "Person has assignment history; cannot delete")
        cur.execute("DELETE FROM people WHERE id=%s", (person_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Person not found")
        conn.commit()
        return
    finally:
        cur.close(); conn.close()

@app.get("/items/search-lite", response_model=List[dict])
def search_items_lite(q: str, limit: int = 20, user=Depends(get_current_user)):
    like = f"%{q}%"
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
      SELECT item_id, name
      FROM items
      WHERE item_id LIKE %s OR name LIKE %s OR serial_no LIKE %s
      ORDER BY item_id ASC
      LIMIT %s
    """, (like, like, like, int(limit)))
    data = [{"item_id": r[0], "name": r[1]} for r in cur.fetchall()]
    cur.close(); conn.close()
    return data

# --------------------------------------------------------------------------
# Assignments + Entries (audit)
# --------------------------------------------------------------------------
class AssignIn(BaseModel):
    item_id: str
    person_id: int
    due_back_date: Optional[str] = None
    notes: Optional[str] = None

@app.post("/assignments", status_code=201)
def assign_to_person_api(data: AssignIn, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()

    cur.execute("SELECT 1 FROM items WHERE item_id=%s", (data.item_id,))
    if not cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(404, "Item not found")

    target = fetch_person(conn, data.person_id)
    if not target:
        cur.close(); conn.close()
        raise HTTPException(404, "Person not found")

    cur.execute("SELECT 1 FROM assignments WHERE item_id=%s AND returned_at IS NULL", (data.item_id,))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(409, "Item is already assigned to someone")

    cur.execute("""
      INSERT INTO assignments (item_id, person_id, assigned_at, due_back_date, returned_at, notes, assigned_by)
      VALUES (%s,%s,NOW(), %s, NULL, %s, %s)
    """, (data.item_id, data.person_id, data.due_back_date, data.notes, user["username"]))
    conn.commit()

    log_entry(conn, "assign", data.item_id, frm=None, to=person_label(target),
              by_user=user["username"], notes=data.notes)

    cur.close(); conn.close()
    return {"ok": True}

class ReturnIn(BaseModel):
    assignment_id: int
    item_id: str
    notes: Optional[str] = None

@app.post("/assignments/return")
def return_assignment_api(data: ReturnIn, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor(dictionary=True)

    cur.execute("""
      SELECT id, person_id FROM assignments
      WHERE id=%s AND item_id=%s AND returned_at IS NULL
    """, (data.assignment_id, data.item_id))
    row = cur.fetchone()
    if not row:
        conn.rollback(); cur.close(); conn.close()
        raise HTTPException(404, "Active assignment not found")

    holder = fetch_person(conn, int(row["person_id"]))

    cur2 = conn.cursor()
    cur2.execute("""
      UPDATE assignments
         SET returned_at=NOW(),
             notes = CASE
                       WHEN %s IS NULL OR %s='' THEN notes
                       ELSE TRIM(CONCAT(COALESCE(notes,''), ' ', %s))
                     END
       WHERE id=%s AND item_id=%s
    """, (data.notes, data.notes, data.notes or "", data.assignment_id, data.item_id))
    conn.commit()

    log_entry(conn, "return", data.item_id, frm=person_label(holder), to="Stock",
              by_user=user["username"], notes=data.notes or "")

    cur.close(); conn.close()
    return {"ok": True}

# >>> Updated transfer input to support serial + from_person verification
class TransferIn(BaseModel):
    item_id: Optional[str] = None
    serial_no: Optional[str] = None
    from_person_id: Optional[int] = None
    to_person_id: int
    due_back_date: Optional[str] = None
    notes: Optional[str] = None
    item_name_for_log: Optional[str] = None

@app.post("/assignments/transfer")
def transfer_assignment_api(data: TransferIn, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor(dictionary=True)

    # Resolve item by item_id OR serial_no
    item_id = data.item_id
    if not item_id:
        if not data.serial_no:
            cur.close(); conn.close()
            raise HTTPException(400, "Provide item_id or serial_no")
        cur.execute("SELECT item_id, name FROM items WHERE serial_no=%s", (data.serial_no,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            raise HTTPException(404, "No item found with that serial number")
        item_id = row["item_id"]

    # Verify "from" person if provided
    current = active_assignment(conn, item_id)
    if data.from_person_id is not None:
        if not current:
            cur.close(); conn.close()
            raise HTTPException(409, "Item is not currently assigned")
        if int(current["person_id"]) != int(data.from_person_id):
            cur.close(); conn.close()
            raise HTTPException(409, "Serial does not belong to the selected 'From' person")

    # Resolve target person
    tgt = fetch_person(conn, data.to_person_id)
    if not tgt:
        cur.close(); conn.close()
        raise HTTPException(404, "Target person not found")

    # Close current (if any) then open new
    cur2 = conn.cursor()
    if current:
        cur2.execute("UPDATE assignments SET returned_at=NOW() WHERE id=%s", (current["id"],))
    cur2.execute("""
      INSERT INTO assignments (item_id, person_id, assigned_at, due_back_date, returned_at, notes, assigned_by)
      VALUES (%s,%s,NOW(), %s, NULL, %s, %s)
    """, (item_id, data.to_person_id, data.due_back_date, data.notes, user["username"]))
    conn.commit()

    # Enrich notes with serial/name for audit trail
    extra = []
    if data.serial_no: extra.append(f"serial:{data.serial_no}")
    if data.item_name_for_log: extra.append(f"name:{data.item_name_for_log}")
    audit_notes = (data.notes or "")
    if extra:
        audit_notes = (audit_notes + " [" + " | ".join(extra) + "]").strip()

    log_entry(conn, "transfer", item_id,
              frm=person_label(fetch_person(conn, current["person_id"])) if current else None,
              to=person_label(tgt),
              by_user=user["username"], notes=audit_notes)

    cur.close(); conn.close()
    return {"ok": True}

@app.get("/assignments/active/{item_id}", response_model=Optional[ActiveAssignmentOut])
def active_for_item(item_id: str, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
      SELECT a.id, a.item_id, i.name, a.person_id, COALESCE(p.full_name,'')
      FROM assignments a
      LEFT JOIN items i ON i.item_id = a.item_id
      LEFT JOIN people p ON p.id = a.person_id
      WHERE a.item_id=%s AND a.returned_at IS NULL
      ORDER BY a.id DESC
      LIMIT 1
    """, (item_id,))
    r = cur.fetchone()
    cur.close(); conn.close()
    if not r:
        return None
    return ActiveAssignmentOut(
        id=int(r[0]), item_id=r[1], item_name=r[2], person_id=int(r[3]), person_name=r[4]
    )

# --------------------------------------------------------------------------
# Entries (audit log)
# --------------------------------------------------------------------------
@app.get("/entries", response_model=List[EntryOut])
def list_entries(limit: int = 200, user=Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
      SELECT id, event_time, event, item_id, from_holder, to_holder, by_user, notes
      FROM entries
      ORDER BY event_time DESC, id DESC
      LIMIT %s
    """, (int(limit),))
    rows = cur.fetchall()
    cur.close(); conn.close()
    out: List[EntryOut] = []
    for r in rows:
        out.append(EntryOut(
            id=int(r[0]),
            event_time=r[1].strftime("%Y-%m-%d %H:%M:%S") if r[1] else "",
            event=r[2],
            item_id=r[3],
            from_holder=r[4],
            to_holder=r[5],
            by_user=r[6],
            notes=r[7],
        ))
    return out
