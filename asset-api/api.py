# api.py
from fastapi import (
    FastAPI, HTTPException, UploadFile, File, Form, Depends
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import timedelta
import os, uuid, shutil

from db import get_conn
from security import (
    create_access_token, verify_password, hash_password, decode_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# ---------------- App / CORS / Static ----------------
auth_scheme = HTTPBearer(auto_error=True)

app = FastAPI(title="AssetVault API", version="1.2")

# Allow localhost, LAN 172.x, and Cloudflare quick tunnels for dev
# (In prod behind Apache, you can restrict further.)
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

# ---------------- Auth helpers ----------------
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(auth_scheme)) -> dict:
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid token")
    return {"username": payload.get("sub"), "role": payload.get("role", "staff")}

# ---------------- Schemas ----------------
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
    photo_url: Optional[str] = None           # primary/legacy photo
    photos: List[PhotoOut] = []               # additional photos with IDs

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

# ---------------- DB helpers ----------------
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

# ---------------- Health (quick check) ----------------
@app.get("/health")
def health():
    return {"ok": True}

# ---------------- Auth endpoints ----------------
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

# ---------------- Items: list/search/detail ----------------
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

# ---------------- Items: create/update/delete ----------------
@app.post("/items", status_code=201, response_model=ItemOut)
def create_item(
    item_id: str = Form(...),
    name: str = Form(...),
    quantity: int = Form(0),
    serial_no: Optional[str] = Form(None),
    model_no: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    transfer_from: Optional[str] = Form(None),
    transfer_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM items WHERE item_id=%s", (item_id,))
        if cur.fetchone():
            raise HTTPException(409, "Item ID already exists")
        cur.execute("""
            INSERT INTO items
              (item_id, name, quantity, serial_no, model_no, department, owner,
               transfer_from, transfer_to, notes, photo_url, created_by, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,NOW())
        """, (item_id, name, quantity, serial_no, model_no, department, owner,
              transfer_from, transfer_to, notes, user["username"]))
        conn.commit()
        return _fetch_item(conn, item_id)
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

# ---------------- Photos: legacy primary photo ----------------
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

# ---------------- Photos: list / add many / delete by id ----------------
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
        # current count
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
            # cleanup any files we just saved
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

    # best-effort file removal
    try:
        fname = url.rsplit("/", 1)[-1]
        os.remove(os.path.join("uploads", fname))
    except Exception:
        pass
    return
