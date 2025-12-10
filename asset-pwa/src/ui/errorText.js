// src/ui/errorText.js
// Always return a *string* for display, never a raw object.

export default function errorText(err, fallback = "Something went wrong") {
  if (!err) return fallback;

  // Axios-style payloads
  const res = err.response?.data ?? err.data ?? null;

  // FastAPI style: detail can be string OR object
  let detail = res?.detail ?? res?.error ?? res?.message ?? res;

  // If detail is an object (like { message, active_items }), extract a nice message
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string") {
      return detail.message;
    }
    try {
      // Last resort, but still a string
      return JSON.stringify(detail);
    } catch {
      /* ignore */
    }
  }

  if (typeof detail === "string") return detail;
  if (typeof err.message === "string") return err.message;

  return fallback;
}
