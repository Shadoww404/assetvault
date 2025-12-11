// src/ui/assetUrl.js
const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export default function assetUrl(path = "") {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  return `${API}${path}`;
}
