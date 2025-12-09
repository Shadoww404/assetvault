// src/ui/errorText.js
export default function errorText(e, fallback = "Something went wrong") {
  const msg =
    e?.response?.data?.detail ||
    e?.response?.data?.message ||
    e?.message ||
    e?.toString?.() ||
    fallback;
  if (typeof msg === "string") return msg;
  try {
    return JSON.stringify(msg);
  } catch {
    return fallback;
  }
}
