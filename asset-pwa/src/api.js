// src/api.js
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

const getToken = () =>
  sessionStorage.getItem("av_token") ?? localStorage.getItem("av_token");

// attach JWT from sessionStorage (fallback to localStorage for older tokens)
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
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

// ---- Items (Serial-first) ----
export const listItems = () => api.get("/items");
export const searchItems = (q) => api.get("/items/search", { params: { q } });

// Create: pass a plain object, we build FormData
export function createItem(obj) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== "") fd.append(k, v);
  }
  return api.post("/items", fd);
}

export const getItemBySerial = (serial) =>
  api.get(`/items/by-serial/${encodeURIComponent(serial)}`);
export const updateItem = (id, patch) =>
  api.put(`/items/${encodeURIComponent(id)}`, patch);
export const updateItemBySerial = (serial, patch) =>
  api.put(`/items/by-serial/${encodeURIComponent(serial)}`, patch);
export const deleteItem = (id) =>
  api.delete(`/items/${encodeURIComponent(id)}`);

// Photos
export const uploadPrimaryPhoto = (itemId, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/items/${encodeURIComponent(itemId)}/photo`, fd);
};

export const uploadPhotos = (itemId, files) => {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return api.post(`/items/${encodeURIComponent(itemId)}/photos`, fd);
};

export const listPhotos = (itemId) =>
  api.get(`/items/${encodeURIComponent(itemId)}/photos`);
export const deletePhoto = (itemId, photoId) =>
  api.delete(`/items/${encodeURIComponent(itemId)}/photos/${photoId}`);

// ---- People/Departments ----
export const listDepartments = () => api.get("/departments");
export const listPeople = (params = {}) =>
  api.get("/people", { params });
export const getPerson = (id) => api.get(`/people/${id}`);
export const getPersonHistory = (id) => api.get(`/people/${id}/history`);

// Typeahead for equipment (returns item_id + name)
export const searchItemsLite = (q) =>
  api.get("/items/search-lite", { params: { q } });

// ---- Assignments / Transfers ----
export const assignToPerson = (payload) => api.post("/assignments", payload);
export const returnAssignment = (payload) =>
  api.post("/assignments/return", payload);
export const transferAssignment = (payload) =>
  api.post("/assignments/transfer", payload);
export const getActiveAssignment = (itemId) =>
  api.get(`/items/${encodeURIComponent(itemId)}/active`);

// ---- Admin ----
export const createDepartment = (name) =>
  api.post("/departments", { name });
export const updateDepartment = (id, name) =>
  api.patch(`/departments/${id}`, { name });
export const deleteDepartment = (id) =>
  api.delete(`/departments/${id}`);

export const createPerson = (body) => api.post("/people", body);
export const updatePerson = (id, body) =>
  api.patch(`/people/${id}`, body);
export const deletePerson = (id) =>
  api.delete(`/people/${id}`);


// ---- Users (admin) ----
export const listUsers = () => api.get("/users");
export const createUser = (body) => api.post("/users", body);
export const updateUser = (username, body) =>
  api.patch(`/users/${encodeURIComponent(username)}`, body);
export const deleteUser = (username) =>
  api.delete(`/users/${encodeURIComponent(username)}`);

// ---- Entries ----
export const listEntries = (limit = 200) =>
  api.get(`/entries`, { params: { limit } });

// ---- Service records ----
export const listServiceRecords = (itemId) =>
  api.get(`/items/${encodeURIComponent(itemId)}/services`);

export const addServiceRecord = (itemId, payload) =>
  api.post(`/items/${encodeURIComponent(itemId)}/services`, payload);

export const getServiceStatus = (itemId) =>
  api.get(`/items/${encodeURIComponent(itemId)}/service-status`);

export const listServiceOverview = () =>
  api.get(`/services/overview`);

// ---- Dashboard ----
export const getDashboardSummary = () =>
  api.get("/dashboard/summary");

export const getDashboard = () =>
  api.get("/dashboard/overview");

export default api;
