function parseBoundedPositiveInteger(raw: string | undefined, fallback: number, maximum: number) {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(value, maximum);
}

export function parsePagination(page: string | undefined, limit: string | undefined) {
  const pageNumber = parseBoundedPositiveInteger(page, 1, 100_000);
  const limitNumber = parseBoundedPositiveInteger(limit, 20, 50);
  return {
    pageIndex: pageNumber - 1,
    limit: limitNumber,
  };
}
