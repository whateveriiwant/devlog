export interface SearchData {
  url: string;
  plain_excerpt?: string;
  meta: Record<string, string>;
}

export async function searchPosts(query: string): Promise<SearchData[]> {
  const response = await fetch(
    `/api/content/search?q=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error('Search temporarily unavailable');
  const result = (await response.json()) as { entries: SearchData[] };
  if (!Array.isArray(result.entries))
    throw new Error('Invalid search response');
  return result.entries;
}
