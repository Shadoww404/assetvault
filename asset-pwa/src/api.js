// src/api.js
// src/api.js
import axios from "axios";
const apiBase = "/api"; // <-- force the proxy path in dev

export const api = axios.create({ baseURL: apiBase });

// ...



// Attach JWT automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("av_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Auth ----
export async function login(username, password) {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  const { data } = await api.post("/auth/login", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data.access_token;
}

export const me = () => api.get("/auth/me");

// ---- Items ----
export const listItems   = () => api.get("/items");
export const searchItems = (q) => api.get("/items/search", { params: { q } });

export const createItem = (formData) => api.post("/items", formData);

// Legacy primary photo (if you still use it)
export const uploadPrimaryPhoto = (itemId, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/items/${encodeURIComponent(itemId)}/photo`, fd);
};

// Multiple photos (NEW) — send all files under field name "files"
export async function uploadPhotos(itemId, files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  await api.post(`/items/${encodeURIComponent(itemId)}/photos`, fd);
}

export const listPhotos  = (itemId) => api.get(`/items/${encodeURIComponent(itemId)}/photos`);
export const deletePhoto = (itemId, photoId) =>
  api.delete(`/items/${encodeURIComponent(itemId)}/photos/${photoId}`);
