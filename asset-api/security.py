# security.py
import os, time, jwt
from passlib.context import CryptContext

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "dev-secret-change-me"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # default 24h

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)

def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)

def create_access_token(claims: dict, expires_delta=None) -> str:
    payload = dict(claims)
    exp_seconds = (expires_delta.total_seconds() if expires_delta else 60 * 15)
    payload["exp"] = int(time.time() + exp_seconds)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
