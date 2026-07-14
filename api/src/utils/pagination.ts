export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
