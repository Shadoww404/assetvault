from fastapi import (
    FastAPI, HTTPException, UploadFile, File, Form,
    Depends, Path
)
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
import os, uuid, shutil

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field

from mysql.connector import InternalError
from db import get_conn
from security import (
    create_access_token, verify_password, hash_password, decode_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# catch MySQL "unknown column" cleanly for fallback queries
try:
    from mysql.connector import errors as mysql_errors
except Exception:  # plugin-safe
    class _Dummy:
        ProgrammingError = Exception
    mysql_errors = _Dummy()

# --------------------------------------------------------------------------
# App / CORS / Static
# --------------------------------------------------------------------------
auth_scheme = HTTPBearer(auto_error=True)

app = FastAPI(title="AssetVault API", version="1.9")

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

def require_admin(user = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user

# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class DashCategoryOut(BaseModel):
    category: str
    total: int
    in_use: int
    available: int
    in_use_pct: float

class DashCompanyCategoryOut(BaseModel):
    category: str
    total: int
    in_use: int

class DashCompanyOut(BaseModel):
    department: str
    total: int
    in_use: int
    available: int
    in_use_pct: float
    categories: List[DashCompanyCategoryOut]

class DashOverallOut(BaseModel):
    total_items: int
    in_use: int
    available: int
    in_use_pct: float

class DashboardOut(BaseModel):
    overall: DashOverallOut
    by_category: List[DashCategoryOut]
    by_company: List[DashCompanyOut]

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: Optional[str] = "staff"

class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str

class UserPatch(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    new_password: Optional[str] = None

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
    # NEW: persist category explicitly (Desktop / Laptop / Printer / UPS / Other)
    category: Optional[str] = None

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
    # allow updating category
    category: Optional[str] = None

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

# Payloads used by /assignments endpoints (matches frontend)
class AssignIn(BaseModel):
    item_id: str
    person_id: int
    due_back_date: Optional[str] = None
    notes: Optional[str] = None

class ReturnIn(BaseModel):
    assignment_id: int
    item_id: str
    notes: Optional[str] = None

class TransferIn(BaseModel):
    item_id: Optional[str] = None
    serial_no: Optional[str] = None
    from_person_id: Optional[int] = None
    to_person_id: int
    due_back_date: Optional[str] = None
    notes: Optional[str] = None
    item_name_for_log: Optional[str] = None

# --- Services: models ---
class ServiceIn(BaseModel):
    service_date: Optional[str] = None   # YYYY-MM-DD
    serviced: Optional[bool] = True
    location: Optional[str] = None
    notes: Optional[str] = None

class ServiceOut(BaseModel):
    id: int
    item_id: str
    service_date: str
    serviced: bool
    location: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None

class ServiceStatusOut(BaseModel):
    item_id: str
    last_service_date: Optional[str] = None
    due_date: Optional[str] = None
    status: str  # "ok" | "due" | "never"
    days_since_service: Optional[int] = None
    days_until_due: Optional[int] = None
    days_overdue: Optional[int] = None

class ServiceOverviewOut(BaseModel):
    item_id: str
    name: Optional[str] = None
    serial_no: Optional[str] = None
    department: Optional[str] = None
    last_service_date: Optional[str] = None
    due_date: Optional[str] = None
    status: str  # "ok" | "due" | "never"
    days_until_due: Optional[int] = None
    days_overdue: Optional[int] = None

# --------------------------------------------------------------------------
# DB helpers
# --------------------------------------------------------------------------
# NOTE: include category at the end
SELECT_LIST = """
  item_id, name, quantity, serial_no, model_no, department, owner,
  transfer_from, transfer_to, notes, photo_url, created_by, created_at, category
"""

def _row_to_item(r) -> ItemOut:
    return ItemOut(
        item_id=r[0],
        name=r[1],
        quantity=int(r[2]),
        serial_no=r[3],
        model_no=r[4],
        department=r[5],
        owner=r[6],
        transfer_from=r[7],
        transfer_to=r[8],
        notes=r[9],
        photo_url=r[10],
        created_by=r[11],
        created_at=(r[12].strftime("%Y-%m-%d %H:%M:%S") if r[12] else None),
        category=r[13],
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

def get_item_by_serial(conn, serial: str) -> Optional[ItemOut]:
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT {SELECT_LIST} FROM items WHERE serial_no=%s", (serial,))
        r = cur.fetchone()
        if not r:
            return None
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
# Services: helpers / schema
# --------------------------------------------------------------------------
def ensure_service_schema(conn):
    """
    Make sure service_records table + index exist.
    """
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS service_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_id VARCHAR(50) NOT NULL,
            service_date DATE NOT NULL,
            serviced TINYINT(1) NOT NULL DEFAULT 1,
            location VARCHAR(255) NULL,
            notes TEXT NULL,
            created_by VARCHAR(100) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_service_item FOREIGN KEY (item_id)
              REFERENCES items(item_id)
              ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )

    try:
        cur.execute(
            """
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'service_records'
              AND INDEX_NAME = 'idx_item'
            """
        )
        has_idx = cur.fetchone()
        if not has_idx:
            cur.execute("CREATE INDEX idx_item ON service_records(item_id, service_date)")
    except InternalError:
        conn.cmd_reset_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT 1
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'service_records'
              AND INDEX_NAME = 'idx_item'
            """
        )
        has_idx = cur.fetchone()
        if not has_idx:
            cur.execute("CREATE INDEX idx_item ON service_records(item_id, service_date)")

    conn.commit()
    cur.close()

def _row_to_service(r) -> ServiceOut:
    return ServiceOut(
        id=int(r[0]),
        item_id=r[1],
        service_date=r[2].strftime("%Y-%m-%d") if r[2] else None,
        serviced=bool(r[3]),
        location=r[4],
        notes=r[5],
        created_by=r[6],
        created_at=r[7].strftime("%Y-%m-%d %H:%M:%S") if r[7] else None,
    )

def list_service_records(conn, item_id: str) -> List[ServiceOut]:
    cur = conn.cursor()
    try:
        try:
            cur.execute("""
              SELECT id, item_id, service_date, serviced, location, notes, created_by, created_at
              FROM service_records
              WHERE item_id=%s
              ORDER BY service_date DESC, id DESC
            """, (item_id,))
        except mysql_errors.ProgrammingError as e:
            if getattr(e, "errno", None) != 1054:
                raise
            cur.execute("""
              SELECT id, item_id, service_date, 1 AS serviced, location, notes, created_by, created_at
              FROM service_records
              WHERE item_id=%s
              ORDER BY service_date DESC, id DESC
            """, (item_id,))
        rows = cur.fetchall()
        return [_row_to_service(r) for r in rows]
    finally:
        cur.close()

def compute_service_status(conn, item_id: str) -> ServiceStatusOut:
    cur = conn.cursor()
    try:
        try:
            cur.execute("""
              SELECT MAX(service_date)
              FROM service_records
              WHERE item_id=%s AND serviced=1
            """, (item_id,))
        except mysql_errors.ProgrammingError as e:
            if getattr(e, "errno", None) != 1054:
                raise
            cur.execute("""
              SELECT MAX(service_date)
              FROM service_records
              WHERE item_id=%s
            """, (item_id,))
        row = cur.fetchone()
    finally:
        cur.close()

    today = date.today()

    if not row or not row[0]:
        return ServiceStatusOut(
            item_id=item_id, status="never",
            last_service_date=None, due_date=None,
            days_since_service=None, days_until_due=None, days_overdue=None
        )

    last = row[0]
    if isinstance(last, datetime):
        last = last.date()

    due = last + timedelta(days=183)  # ~6 months
    days_since = (today - last).days
    if today <= due:
        return ServiceStatusOut(
            item_id=item_id, status="ok",
            last_service_date=last.strftime("%Y-%m-%d"),
            due_date=due.strftime("%Y-%m-%d"),
            days_since_service=days_since,
            days_until_due=(due - today).days,
            days_overdue=0
        )
    else:
        return ServiceStatusOut(
            item_id=item_id, status="due",
            last_service_date=last.strftime("%Y-%m-%d"),
            due_date=due.strftime("%Y-%m-%d"),
            days_since_service=days_since,
            days_until_due=0,
            days_overdue=(today - due).days
        )

def list_service_overview(conn):
    """
    Per-item service status for Services page.
    Uses items.department (string) – no dependency on department_id.
    """
    cur = conn.cursor(dictionary=True)
    today = date.today()

    cur.execute(
        """
        SELECT
            i.item_id,
            i.name,
            i.serial_no,
            i.department,
            MAX(s.service_date) AS last_service_date
        FROM items i
        LEFT JOIN service_records s ON s.item_id = i.item_id
        GROUP BY i.item_id, i.name, i.serial_no, i.department
        ORDER BY i.item_id
        """
    )
    rows = cur.fetchall()
    cur.close()

    results = []

    for r in rows:
        last = r["last_service_date"]
        if isinstance(last, datetime):
            last_date = last.date()
        else:
            last_date = last  # date or None

        if last_date:
            due = last_date + timedelta(days=365)
        else:
            due = None

        if isinstance(due, datetime):
            due = due.date()

        if last_date is None:
            status = "never"
            days_overdue = None
            due_date = today  # treat never as "due now" for UI
        else:
            if due is not None and today <= due:
                status = "ok"
                days_overdue = 0
                due_date = due
            else:
                status = "due"
                if due is not None:
                    days_overdue = (today - due).days
                    due_date = due
                else:
                    days_overdue = None
                    due_date = None

        results.append(
            {
                "item_id": r["item_id"],
                "name": r["name"],
                "serial_no": r["serial_no"],
                "department": r["department"],
                "last_service_date": last_date.isoformat() if last_date else None,
                "due_date": due_date.isoformat() if due_date else None,
                "status": status,
                "days_overdue": days_overdue,
            }
        )

    return results

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
def me(user = Depends(get_current_user)):
    return user

# --------------------------------------------------------------------------
# Users (admin)
# --------------------------------------------------------------------------
@app.get("/users", response_model=List[UserOut])
def list_users(_admin = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT id, username, full_name, role FROM users ORDER BY username")
    data = [UserOut(id=int(r[0]), username=r[1], full_name=r[2], role=r[3]) for r in cur.fetchall()]
    cur.close(); conn.close()
    return data

@app.post("/users", response_model=UserOut)
def create_user_api(body: UserCreate, _admin = Depends(require_admin)):
    if not body.password:
        raise HTTPException(422, "Password is required")
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM users WHERE username=%s", (body.username,))
        if cur.fetchone():
            raise HTTPException(409, "Username already exists")
        cur.execute("""
            INSERT INTO users (username, password_hash, full_name, role)
            VALUES (%s,%s,%s,%s)
        """, (body.username, hash_password(body.password), body.full_name, body.role or "staff"))
        new_id = cur.lastrowid
        conn.commit()
        return UserOut(id=int(new_id), username=body.username, full_name=body.full_name, role=body.role or "staff")
    finally:
        cur.close(); conn.close()

@app.patch("/users/{username}", response_model=UserOut)
def update_user_api(username: str, body: UserPatch, _admin = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, full_name, role FROM users WHERE username=%s", (username,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "User not found")
        full_name = body.full_name if body.full_name is not None else row["full_name"]
        role = body.role if body.role is not None else row["role"]
        cur2 = conn.cursor()
        cur2.execute("UPDATE users SET full_name=%s, role=%s WHERE username=%s", (full_name, role, username))
        if body.new_password:
            cur2.execute("UPDATE users SET password_hash=%s WHERE username=%s", (hash_password(body.new_password), username))
        conn.commit()
        return UserOut(id=int(row["id"]), username=username, full_name=full_name, role=role)
    finally:
        cur.close(); conn.close()

@app.delete("/users/{username}", status_code=204)
def delete_user_api(username: str, _admin = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM users WHERE username=%s", (username,))
        if cur.rowcount == 0:
            raise HTTPException(404, "User not found")
        conn.commit()
        return
    finally:
        cur.close(); conn.close()

# --------------------------------------------------------------------------
# Items: list / search / get
# --------------------------------------------------------------------------
@app.get("/items", response_model=List[ItemOut])
def list_items(user = Depends(get_current_user)):
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
def search_items(q: str, user = Depends(get_current_user)):
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
def get_item(item_id: str, user = Depends(get_current_user)):
    conn = get_conn()
    try:
        return _fetch_item(conn, item_id)
    finally:
        conn.close()

@app.get("/items/by-serial/{serial}", response_model=ItemOut)
def get_item_by_serial_api(serial: str = Path(..., min_length=1), user = Depends(get_current_user)):
    conn = get_conn()
    try:
        obj = get_item_by_serial(conn, serial)
        if not obj:
            raise HTTPException(404, "Item not found")
        return obj
    finally:
        conn.close()

@app.get("/items/{item_id}/active")
def get_item_active(item_id: str, user = Depends(get_current_user)):
    conn = get_conn()
    try:
        a = active_assignment(conn, item_id)
        if not a:
            return {}
        holder = fetch_person(conn, int(a["person_id"])) if a.get("person_id") else None
        return {
            "assignment_id": a["id"],
            "person_id": a["person_id"],
            "person_name": holder.get("full_name") if holder else None,
        }
    finally:
        conn.close()

# --------------------------------------------------------------------------
# Items: create / update / delete
# --------------------------------------------------------------------------
@app.post("/items", status_code=201, response_model=ItemOut)
def create_item(
    item_id: Optional[str] = Form(None),
    name: str = Form(...),
    quantity: int = Form(0),
    serial_no: Optional[str] = Form(None),
    model_no: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    transfer_from: Optional[str] = Form(None),
    transfer_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    # NEW: accept category from frontend / CSV FormData
    category: Optional[str] = Form(None),
    user = Depends(get_current_user),
):
    new_id = item_id or uuid.uuid4().hex[:8].upper()
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (new_id,))
        if cur.fetchone():
            raise HTTPException(409, "Item ID already exists")
        cur.execute("""
            INSERT INTO items
              (item_id, name, quantity, serial_no, model_no, department, owner,
               transfer_from, transfer_to, notes, photo_url, created_by, created_at, category)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,NOW(),%s)
        """, (
            new_id,
            name,
            quantity,
            serial_no,
            model_no,
            department,
            owner,
            transfer_from,
            transfer_to,
            notes,
            user["username"],
            category,
        ))
        conn.commit()
        return _fetch_item(conn, new_id)
    finally:
        cur.close(); conn.close()

@app.put("/items/{item_id}", response_model=ItemOut)
def update_item(item_id: str, patch: ItemUpdate, user = Depends(get_current_user)):
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
            "category": patch.category if patch.category is not None else row.get("category"),
        }
        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE items SET
              name=%s,
              quantity=%s,
              serial_no=%s,
              model_no=%s,
              department=%s,
              owner=%s,
              transfer_from=%s,
              transfer_to=%s,
              notes=%s,
              category=%s
            WHERE item_id=%s
        """, (
            fields["name"],
            fields["quantity"],
            fields["serial_no"],
            fields["model_no"],
            fields["department"],
            fields["owner"],
            fields["transfer_from"],
            fields["transfer_to"],
            fields["notes"],
            fields["category"],
            item_id,
        ))
        conn.commit()
        return _fetch_item(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.put("/items/by-serial/{serial}", response_model=ItemOut)
def update_item_by_serial(serial: str, patch: ItemUpdate, user = Depends(get_current_user)):
    conn = get_conn()
    try:
        obj = get_item_by_serial(conn, serial)
        if not obj:
            raise HTTPException(404, "Item not found")
        # reuse main update logic
        return update_item(obj.item_id, patch, user)
    finally:
        conn.close()

@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM assignments WHERE item_id=%s AND returned_at IS NULL LIMIT 1", (item_id,))
        if cur.fetchone():
            raise HTTPException(409, "Item has an active assignment; return it first")
        cur.execute("DELETE FROM items WHERE item_id=%s", (item_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "Item not found")
        return
    finally:
        cur.close(); conn.close()

# --------------------------------------------------------------------------
# Lightweight item search (typeahead)
# --------------------------------------------------------------------------
@app.get("/items/search-lite")
def search_items_lite(q: str, limit: int = 20, user = Depends(get_current_user)):
    """
    Lightweight search used by Assignments typeahead.
    Accepts partial item_id / name / serial_no and returns a small list
    of { item_id, name, serial_no }.
    """
    like = f"%{q}%"
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        sql = """
            SELECT item_id, name, serial_no
            FROM items
            WHERE item_id LIKE %s
               OR serial_no LIKE %s
               OR name LIKE %s
            ORDER BY created_at DESC, name
            LIMIT %s
        """
        cur.execute(sql, (like, like, like, int(limit)))
        rows = cur.fetchall()
        return rows
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Photos
# --------------------------------------------------------------------------
@app.post("/items/{item_id}/photo", response_model=ItemOut)
def upload_photo(item_id: str, file: UploadFile = File(...), user = Depends(get_current_user)):
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
def list_photos(item_id: str, user = Depends(get_current_user)):
    conn = get_conn()
    try:
        return get_item_photos(conn, item_id)
    finally:
        conn.close()

@app.post("/items/{item_id}/photos", response_model=List[PhotoOut])
def add_photos(item_id: str, files: List[UploadFile] = File(...), user = Depends(get_current_user)):
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
def delete_photo(item_id: str, photo_id: int, user = Depends(get_current_user)):
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
        item_id=(r[1] or ""),
        item_name=r[2],
        person_id=int(r[3]),
        assigned_at=r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
        due_back_date=r[5].strftime("%Y-%m-%d") if r[5] else None,
        returned_at=r[6].strftime("%Y-%m-%d %H:%M:%S") if r[6] else None,
        notes=r[7],
    )

@app.get("/departments", response_model=List[DepartmentOut])
def list_departments(user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT id, name FROM departments ORDER BY name ASC")
    data = [DepartmentOut(id=int(r[0]), name=r[1]) for r in cur.fetchall()]
    cur.close(); conn.close()
    return data

@app.post("/departments", response_model=DepartmentOut)
def create_department(body: DepartmentIn, _admin = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("INSERT INTO departments (name) VALUES (%s)", (body.name.strip(),))
        new_id = cur.lastrowid
        conn.commit()
        return DepartmentOut(id=int(new_id), name=body.name.strip())
    finally:
        cur.close(); conn.close()

@app.patch("/departments/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: int, body: DepartmentIn, _admin = Depends(require_admin)):
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
def delete_department(dept_id: int, _admin = Depends(require_admin)):
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
def list_people(
    dept_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 100,
    include_inactive: bool = False,
    user=Depends(get_current_user),
):
    conn = get_conn()
    cur = conn.cursor()
    try:
        sql = """
          SELECT p.id, p.emp_code, p.full_name, p.department_id, p.email, p.phone, p.status,
                 d.name AS department_name
          FROM people p
          LEFT JOIN departments d ON d.id = p.department_id
          WHERE 1=1
        """
        args: List[Any] = []

        if not include_inactive:
            sql += " AND (p.status IS NULL OR p.status <> 'inactive')"

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
        return [row_to_person(r) for r in rows]
    finally:
        cur.close()
        conn.close()

@app.get("/people/{person_id}", response_model=PersonOut)
def get_person(person_id: int, user = Depends(get_current_user)):
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
def get_person_history(person_id: int, user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        try:
            cur.execute("""
              SELECT a.id, a.item_id, i.name AS item_name, a.person_id,
                     a.assigned_at, a.due_back_date, a.returned_at, a.notes
              FROM assignments a
              LEFT JOIN items i ON i.item_id = a.item_id
              WHERE a.person_id=%s
              ORDER BY a.assigned_at DESC, a.id DESC
            """, (person_id,))
            rows = cur.fetchall()
        except mysql_errors.ProgrammingError as e:
            if getattr(e, "errno", None) != 1054:
                raise
            try:
                cur.execute("""
                  SELECT a.id, i.item_id, i.name AS item_name, a.person_id,
                         a.assigned_at, a.due_back_date, a.returned_at, a.notes
                  FROM assignments a
                  LEFT JOIN items i ON i.serial_no = a.item_serial
                  WHERE a.person_id=%s
                  ORDER BY a.assigned_at DESC, a.id DESC
                """, (person_id,))
                rows = cur.fetchall()
            except mysql_errors.ProgrammingError as e2:
                if getattr(e2, "errno", None) != 1054:
                    raise
                cur.execute("""
                  SELECT a.id, i.item_id, i.name AS item_name, a.person_id,
                         a.assigned_at, a.due_back_date, a.returned_at, a.notes
                  FROM assignments a
                  LEFT JOIN items i ON i.id = a.item_id_int
                  WHERE a.person_id=%s
                  ORDER BY a.assigned_at DESC, a.id DESC
                """, (person_id,))
                rows = cur.fetchall()

        return [row_to_assignment(r) for r in rows]
    finally:
        cur.close(); conn.close()

@app.post("/people", response_model=PersonOut)
def create_person(body: PersonIn, _admin = Depends(require_admin)):
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
def update_person(person_id: int, body: PersonIn, _admin = Depends(require_admin)):
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

@app.get("/people/{person_id}/active-items")
def get_person_active_items(person_id: int, user=Depends(get_current_user)):
    """
    Utility endpoint:
    List active items currently held by this person.
    """
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT 
                a.id AS assignment_id,
                a.item_id,
                i.name,
                a.assigned_at,
                a.due_back_date
            FROM assignments a
            JOIN items i ON i.item_id = a.item_id
            WHERE a.person_id=%s AND a.returned_at IS NULL
            ORDER BY a.assigned_at DESC, a.id DESC
        """, (person_id,))
        rows = cur.fetchall()
        return rows
    finally:
        cur.close()
        conn.close()

# ------------------------------------------------------------------
# People – delete (admin only, with active-equipment safety check)
# ------------------------------------------------------------------
@app.delete("/people/{person_id}", status_code=204)
def delete_person(person_id: int, _admin=Depends(require_admin)):
    """
    Admin-only delete:
    - Block if the person still has *active* equipment (assignments with returned_at IS NULL).
    - Allow delete if everything is returned / transferred, even if there is history.
    - On conflict, return detail = { message, active_items: [...] } for the UI modal.
    """
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT id, full_name FROM people WHERE id=%s",
            (person_id,),
        )
        person = cur.fetchone()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")

        cur.execute(
            """
            SELECT
                a.id AS assignment_id,
                COALESCE(i.item_id, '') AS item_id,
                COALESCE(i.name, '') AS item_name,
                COALESCE(i.serial_no, '') AS serial_no
            FROM assignments a
            LEFT JOIN items i ON i.item_id = a.item_id
            WHERE a.person_id = %s
              AND a.returned_at IS NULL
            """,
            (person_id,),
        )
        active_items = cur.fetchall()

        if active_items:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": (
                        "This person still has active equipment assigned. "
                        "Please transfer or return all items before deleting."
                    ),
                    "active_items": active_items,
                },
            )

        cur.execute("DELETE FROM people WHERE id=%s", (person_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Person not found")

        conn.commit()
        return
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Assignments – models
# --------------------------------------------------------------------------
class AssignmentCreate(BaseModel):
    """
    We keep the field name item_id for compatibility with the frontend,
    but this value can be EITHER:
      - the real item_id (e.g. "IT-LAP-001"), OR
      - the serial_no (e.g. "MGT-LAP-001-SN").
    The backend will resolve it.
    """
    item_id: str
    person_id: int
    due_back_date: Optional[date] = None
    notes: Optional[str] = None


class AssignmentReturn(BaseModel):
    assignment_id: int
    item_id: str
    notes: Optional[str] = None


class AssignmentTransfer(BaseModel):
    """
    Transfer can also support serial_no and optional from_person_id,
    but the frontend only uses item_id + to_person_id right now.
    """
    item_id: Optional[str] = None
    serial_no: Optional[str] = None
    from_person_id: Optional[int] = None
    to_person_id: int
    due_back_date: Optional[date] = None
    notes: Optional[str] = None

# --------------------------------------------------------------------------
# Assign item to person (POST /assignments)
# --------------------------------------------------------------------------
@app.post("/assignments", status_code=201)
def create_assignment(body: AssignmentCreate, user = Depends(get_current_user)):
    """
    Assign an item to a person.
    Frontend sends { item_id, person_id, due_back_date, notes } where
    `item_id` may actually be an item_id OR a serial_no typed by the user.
    """
    key = (body.item_id or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="item_id is required")

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # 1) Resolve the item: try item_id first, then serial_no
        cur.execute(
            """
            SELECT id, item_id, serial_no, name
            FROM items
            WHERE item_id = %s OR serial_no = %s
            LIMIT 1
            """,
            (key, key),
        )
        item = cur.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        real_item_id = item["item_id"]
        serial = item["serial_no"]

        # 2) Check that the person exists
        cur.execute("SELECT id FROM people WHERE id = %s", (body.person_id,))
        person = cur.fetchone()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")

        # 3) Ensure no active assignment for this item
        cur.execute(
            """
            SELECT id FROM assignments
            WHERE item_id = %s AND returned_at IS NULL
            LIMIT 1
            """,
            (real_item_id,),
        )
        if cur.fetchone():
            raise HTTPException(
                status_code=409,
                detail="Item is already assigned; return or transfer it first",
            )

        # 4) Insert the new assignment row
        cur.execute(
            """
            INSERT INTO assignments
                (item_id_int,
                 serial_no,
                 person_id,
                 assigned_at,
                 due_back_date,
                 returned_at,
                 notes,
                 assigned_by,
                 item_id)
            VALUES (%s, %s, %s, NOW(), %s, NULL, %s, %s, %s)
            """,
            (
                item["id"],             # item_id_int (FK to items.id)
                serial,                 # serial_no
                body.person_id,         # person_id
                body.due_back_date,     # due_back_date (can be None)
                body.notes,             # notes
                user["username"],       # assigned_by
                real_item_id,           # item_id (string, e.g. "IT-LAP-001")
            ),
        )
        assignment_id = cur.lastrowid
        conn.commit()

        # 5) Log entry
        target = fetch_person(conn, body.person_id)
        log_entry(
            conn,
            event="assign",
            item_id=real_item_id,
            frm=None,
            to=person_label(target),
            by_user=user["username"],
            notes=body.notes or item["name"] or "",
        )

        return {"id": assignment_id, "status": "ok"}
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Return an assignment (POST /assignments/return)
# --------------------------------------------------------------------------
@app.post("/assignments/return")
def return_assignment_api(body: AssignmentReturn, user = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # 1) Ensure assignment exists and matches item, and is still active
        cur.execute(
            """
            SELECT id, person_id, item_id
            FROM assignments
            WHERE id = %s AND item_id = %s AND returned_at IS NULL
            """,
            (body.assignment_id, body.item_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Active assignment not found")

        holder = fetch_person(conn, int(row["person_id"])) if row.get("person_id") else None

        # 2) Mark as returned
        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE assignments
               SET returned_at = NOW(),
                   notes = CASE
                             WHEN %s IS NULL OR %s = '' THEN notes
                             ELSE TRIM(CONCAT(COALESCE(notes, ''), ' ', %s))
                           END
             WHERE id = %s AND item_id = %s
            """,
            (body.notes, body.notes, body.notes or "", body.assignment_id, body.item_id),
        )
        conn.commit()

        # 3) Log entry
        log_entry(
            conn,
            event="return",
            item_id=row["item_id"],
            frm=person_label(holder),
            to="Stock",
            by_user=user["username"],
            notes=body.notes or "",
        )

        return {"status": "ok"}
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Transfer an item to another person (POST /assignments/transfer)
# --------------------------------------------------------------------------
@app.post("/assignments/transfer")
def transfer_assignment_api(body: AssignmentTransfer, user = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # 1) Resolve item by item_id or serial_no
        resolved = None
        if body.item_id:
            cur.execute(
                "SELECT id, item_id, serial_no, name FROM items WHERE item_id = %s",
                (body.item_id,),
            )
            resolved = cur.fetchone()
        elif body.serial_no:
            cur.execute(
                "SELECT id, item_id, serial_no, name FROM items WHERE serial_no = %s",
                (body.serial_no,),
            )
            resolved = cur.fetchone()

        if not resolved:
            raise HTTPException(status_code=404, detail="Item not found")

        real_item_id = resolved["item_id"]
        item_name = resolved["name"] or ""

        # 2) Check target person exists
        cur.execute("SELECT id FROM people WHERE id = %s", (body.to_person_id,))
        person = cur.fetchone()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")

        # 3) Current active assignment (if any)
        current = active_assignment(conn, real_item_id)

        # Optional: if from_person_id explicitly given, verify it
        if body.from_person_id is not None:
            if not current or int(current["person_id"]) != int(body.from_person_id):
                raise HTTPException(
                    status_code=409,
                    detail="Item is not currently held by the specified FROM person",
                )

        cur2 = conn.cursor()

        # 4) Close existing assignment
        if current:
            cur2.execute(
                "UPDATE assignments SET returned_at = NOW() WHERE id = %s",
                (current["id"],),
            )

        # 5) Insert new assignment row for the new holder
        cur2.execute(
            """
            INSERT INTO assignments
                (item_id_int,
                 serial_no,
                 person_id,
                 assigned_at,
                 due_back_date,
                 returned_at,
                 notes,
                 assigned_by,
                 item_id)
            VALUES (%s, %s, %s, NOW(), %s, NULL, %s, %s, %s)
            """,
            (
                resolved["id"],          # item_id_int
                resolved["serial_no"],   # serial_no
                body.to_person_id,       # person_id
                body.due_back_date,      # due_back_date
                body.notes,              # notes
                user["username"],        # assigned_by
                real_item_id,            # item_id
            ),
        )
        new_id = cur2.lastrowid
        conn.commit()

        # 6) Log entry
        frm_label = person_label(fetch_person(conn, int(current["person_id"]))) if current else None
        to_label = person_label(fetch_person(conn, body.to_person_id))

        log_entry(
            conn,
            event="transfer",
            item_id=real_item_id,
            frm=frm_label,
            to=to_label,
            by_user=user["username"],
            notes=(body.notes or "").strip() or item_name,
        )

        return {"id": new_id, "status": "ok"}
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Dashboard (simple overview endpoint)
# --------------------------------------------------------------------------
@app.get("/dashboard/overview")
def dashboard_overview(user = Depends(get_current_user)):
    """
    Simple overview (kept for compatibility with api.js:getDashboard()).
    Not used by the React dashboard cards/charts.
    """
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # Category totals based on item names (legacy; doesn't use explicit category)
        cur.execute("""
            SELECT
              CASE
                WHEN LOWER(name) LIKE '%laptop%' THEN 'laptop'
                WHEN LOWER(name) LIKE '%desktop%' OR LOWER(name) LIKE '%pc%' THEN 'desktop'
                WHEN LOWER(name) LIKE '%printer%' THEN 'printer'
                WHEN LOWER(name) LIKE '%ups%' THEN 'ups'
                ELSE 'other'
              END AS category,
              COUNT(*) AS total
            FROM items
            GROUP BY category
        """)
        categories = cur.fetchall()

        # In-use items grouped by department
        cur.execute("""
            SELECT 
                i.item_id,
                COALESCE(i.department, 'Unassigned') AS department,
                CASE
                    WHEN LOWER(i.name) LIKE '%laptop%' THEN 'laptop'
                    WHEN LOWER(i.name) LIKE '%desktop%' OR LOWER(i.name) LIKE '%pc%' THEN 'desktop'
                    WHEN LOWER(i.name) LIKE '%printer%' THEN 'printer'
                    WHEN LOWER(i.name) LIKE '%ups%' THEN 'ups'
                    ELSE 'other'
                END AS category
            FROM assignments a
            JOIN items i ON a.item_id = i.item_id
            WHERE a.returned_at IS NULL
        """)
        in_use = cur.fetchall()

        from collections import Counter
        dept_counts = Counter(row["department"] for row in in_use)

        return {
            "categories": categories,
            "in_use_per_department": dept_counts,
            "in_use_total": len(in_use),
        }
    finally:
        cur.close()
        conn.close()

# --------------------------------------------------------------------------
# Entries
# --------------------------------------------------------------------------
@app.get("/entries", response_model=List[EntryOut])
def list_entries(limit: int = 200, user = Depends(get_current_user)):
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

# --------------------------------------------------------------------------
# Services (routes)
# --------------------------------------------------------------------------
@app.get("/items/{item_id}/services", response_model=List[ServiceOut])
def get_item_services(item_id: str, user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        ensure_service_schema(conn)
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (item_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")
        return list_service_records(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.post("/items/{item_id}/services", response_model=ServiceOut, status_code=201)
def add_item_service(item_id: str, body: ServiceIn, user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        ensure_service_schema(conn)
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (item_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")

        try:
            cur.execute("""
              INSERT INTO service_records (item_id, service_date, serviced, location, notes, created_by, created_at)
              VALUES (%s, COALESCE(%s, CURRENT_DATE), %s, %s, %s, %s, NOW())
            """, (
                item_id,
                (body.service_date or None),
                1 if (body.serviced is not False) else 0,
                (body.location or None),
                (body.notes or None),
                user.get("username"),
            ))
        except mysql_errors.ProgrammingError as e:
            if getattr(e, "errno", None) != 1054:
                raise
            cur.execute("""
              INSERT INTO service_records (item_id, service_date, location, notes, created_by, created_at)
              VALUES (%s, COALESCE(%s, CURRENT_DATE), %s, %s, %s, NOW())
            """, (
                item_id, (body.service_date or None),
                (body.location or None), (body.notes or None), user.get("username")
            ))
        new_id = cur.lastrowid
        conn.commit()

        log_entry(conn, "service", item_id, frm=None, to=None, by_user=user.get("username"),
                  notes=(body.notes or body.location or ""))

        cur2 = conn.cursor()
        try:
            cur2.execute("""
              SELECT id, item_id, service_date, serviced, location, notes, created_by, created_at
              FROM service_records WHERE id=%s
            """, (new_id,))
        except mysql_errors.ProgrammingError as e2:
            if getattr(e2, "errno", None) != 1054:
                cur2.close()
                raise
            cur2.execute("""
              SELECT id, item_id, service_date, 1 AS serviced, location, notes, created_by, created_at
              FROM service_records WHERE id=%s
            """, (new_id,))
        r = cur2.fetchone()
        cur2.close()
        return _row_to_service(r)
    finally:
        cur.close(); conn.close()

@app.get("/items/{item_id}/service-status", response_model=ServiceStatusOut)
def get_item_service_status(item_id: str, user = Depends(get_current_user)):
    conn = get_conn(); cur = conn.cursor()
    try:
        ensure_service_schema(conn)
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (item_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Item not found")
        return compute_service_status(conn, item_id)
    finally:
        cur.close(); conn.close()

@app.get("/services/overview")
def services_overview(user = Depends(get_current_user)):
    conn = get_conn()
    try:
        ensure_service_schema(conn)
        data = list_service_overview(conn)
        return data
    except Exception as e:
        print("SERVICES_OVERVIEW_ERROR:", repr(e))
        return []
    finally:
        conn.close()

# --------------------------------------------------------------------------
# Dashboard summary (used by Dashboard.jsx)
# --------------------------------------------------------------------------
@app.get("/dashboard/summary")
def dashboard_summary(user = Depends(get_current_user)):
    """
    Summary used by the React Dashboard:

    - overall: total / in-use / available
    - by_category: one row per category (Desktop, Laptop, Printer, UPS, Other)
    - by_company: one row per department, with nested category breakdown

    Categories are normalised to:
      Desktop | Laptop | Printer | UPS | Other
    """
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    try:
        # ---------- Overall ----------
        cur.execute("SELECT COUNT(*) AS total_items FROM items")
        total_items = cur.fetchone()["total_items"] or 0

        cur.execute("""
            SELECT COUNT(DISTINCT a.item_id) AS in_use
            FROM assignments a
            WHERE a.returned_at IS NULL
        """)
        in_use = cur.fetchone()["in_use"] or 0

        available = total_items - in_use
        in_use_pct = round((in_use * 100.0 / total_items), 1) if total_items else 0.0

        # Prefer explicit category column; fall back to name
        category_case_expr = """
            CASE
                WHEN COALESCE(i.category, '') <> '' THEN i.category
                WHEN LOWER(i.name) LIKE '%laptop%'   THEN 'Laptop'
                WHEN LOWER(i.name) LIKE '%desktop%' 
                  OR LOWER(i.name) LIKE '%pc%'       THEN 'Desktop'
                WHEN LOWER(i.name) LIKE '%printer%'  THEN 'Printer'
                WHEN LOWER(i.name) LIKE '%ups%'      THEN 'UPS'
                ELSE 'Other'
            END
        """

        # ---------- By category ----------
        cur.execute(f"""
            SELECT
              {category_case_expr} AS category,
              COUNT(*) AS total,
              SUM(
                CASE WHEN a.item_id IS NOT NULL AND a.returned_at IS NULL
                     THEN 1 ELSE 0 END
              ) AS in_use
            FROM items i
            LEFT JOIN assignments a
              ON a.item_id = i.item_id
            GROUP BY category
            ORDER BY category
        """)
        cat_rows = cur.fetchall()

        by_category = []
        for r in cat_rows:
            total = int(r["total"] or 0)
            used = int(r["in_use"] or 0)
            by_category.append({
                "category": r["category"],
                "total": total,
                "in_use": used,
                "available": total - used,
                "in_use_pct": round((used * 100.0 / total), 1) if total else 0.0,
            })

        # ---------- By department (company) ----------
        cur.execute(f"""
            SELECT
              COALESCE(i.department, 'Unassigned') AS department,
              {category_case_expr} AS category,
              COUNT(*) AS total,
              SUM(
                CASE WHEN a.item_id IS NOT NULL AND a.returned_at IS NULL
                     THEN 1 ELSE 0 END
              ) AS in_use
            FROM items i
            LEFT JOIN assignments a
              ON a.item_id = i.item_id
            GROUP BY department, category
            ORDER BY department, category
        """)
        rows = cur.fetchall()

        by_company_map = {}
        for r in rows:
            dept = r["department"]
            cat = r["category"]
            total = int(r["total"] or 0)
            used = int(r["in_use"] or 0)

            entry = by_company_map.setdefault(
                dept,
                {"department": dept, "total": 0, "in_use": 0, "categories": []},
            )
            entry["total"] += total
            entry["in_use"] += used
            if used:
                entry["categories"].append(
                    {
                        "category": cat,
                        "total": total,
                        "in_use": used,
                    }
                )

        by_company = []
        for v in by_company_map.values():
            total = v["total"]
            used = v["in_use"]
            v["available"] = total - used
            v["in_use_pct"] = round((used * 100.0 / total), 1) if total else 0.0
            by_company.append(v)

        return {
            "overall": {
                "total_items": total_items,
                "in_use": in_use,
                "available": available,
                "in_use_pct": in_use_pct,
            },
            "by_category": by_category,
            "by_company": by_company,
        }
    finally:
        cur.close()
        conn.close()
