import { PAGE_SIZE, pageRange, paginationRangeSize } from "./record-pagination.helpers";

export function RecordPagination({
  page,
  total,
  onPageChange,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  const { from, to, pages } = pageRange(page, total, pageSize);
  if (total <= pageSize) return null;

  const pagesPerRange = Math.max(1, Math.floor(paginationRangeSize() / pageSize));
  const rangeIndex = Math.floor((page - 1) / pagesPerRange);
  const ranges = Array.from({ length: Math.ceil(pages / pagesPerRange) }, (_, index) => {
    const firstPage = index * pagesPerRange + 1;
    return {
      firstPage,
      from: (firstPage - 1) * pageSize + 1,
      to: Math.min(firstPage * pageSize + pageSize * (pagesPerRange - 1), total),
    };
  });

  const visible = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (item) => item <= 3 || item > pages - 3 || Math.abs(item - page) <= 1,
  );

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3 text-xs"
      aria-label="Record pages"
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <p>
          Page {page} · {from}–{to} of {total}
        </p>
        {ranges.length > 1 ? (
          <label className="flex items-center gap-1">
            <span className="sr-only">Jump to record range</span>
            <select
              value={rangeIndex}
              onChange={(event) => onPageChange(ranges[Number(event.target.value)]!.firstPage)}
              className="rounded border border-border bg-surface px-2 py-1 text-foreground"
              aria-label="Jump to record range"
            >
              {ranges.map((range, index) => (
                <option key={range.firstPage} value={index}>
                  {range.from.toLocaleString()}–{range.to.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        {visible.map((item, index) => {
          const prior = visible[index - 1];
          return (
            <span key={item} className="contents">
              {prior != null && item - prior > 1 ? (
                <span className="px-1 text-muted-foreground">…</span>
              ) : null}
              <button
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
                className={`rounded border px-2 py-1 ${item === page ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60"}`}
              >
                Page {item}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
