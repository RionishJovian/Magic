export const PAGE_SIZE = 100;
const RANGE_SIZE = 1000;

export function pageRange(page: number, total: number, pageSize = PAGE_SIZE) {
  if (!total) return { from: 0, to: 0, pages: 1 };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  return {
    from: (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, total),
    pages,
  };
}

export function paginationRangeSize() {
  return RANGE_SIZE;
}
