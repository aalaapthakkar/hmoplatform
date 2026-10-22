/** Supabase returns at most 1,000 rows a request, so big lists are read in pages. */
const PAGE = 1000;

/**
 * Reads every row of a query, a page at a time. `page` runs the query for one
 * range of rows; give it a stable order (such as by id) so pages don't overlap.
 */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
