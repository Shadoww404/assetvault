// src/ui/pagination.jsx
import { useEffect, useMemo, useState } from "react";

/**
 * Generic client-side pagination hook.
 * - allRows: array of raw rows
 * - initialPageSize: default rows per page
 */
export function usePagination(allRows, initialPageSize = 15) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // When data length or pageSize changes, clamp page into valid range
  const total = allRows?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const rows = useMemo(() => {
    if (!Array.isArray(allRows)) return [];
    const start = (page - 1) * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, page, pageSize]);

  const setPageSize = (newSize) => {
    const n = Number(newSize) || initialPageSize;
    setPageSizeState(n);
    setPage(1); // reset to first page when size changes
  };

  const next = () => setPage((p) => Math.min(pageCount, p + 1));
  const prev = () => setPage((p) => Math.max(1, p - 1));

  return {
    page,
    pageSize,
    setPageSize,
    pageCount,
    total,
    rows,
    next,
    prev,
  };
}

/**
 * PaginationControls – standard footer with:
 * - Rows per page select
 * - "Page X of Y"
 * - Prev / Next buttons
 */
export function PaginationControls({
  page,
  pageCount,
  pageSize,
  setPageSize,
  total,
  next,
  prev,
}) {
  if (!total) return null;

  return (
    <div
      className="row"
      style={{
        marginTop: 12,
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <label className="row" style={{ gap: 4, alignItems: "center" }}>
          <span className="muted">Rows per page</span>
          <select
            className="input"
            style={{ width: 80 }}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
        <span className="muted">Total: {total}</span>
      </div>

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="muted">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={page <= 1}
          onClick={prev}
        >
          ◀
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={page >= pageCount}
          onClick={next}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
