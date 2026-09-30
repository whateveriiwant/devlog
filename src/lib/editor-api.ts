// Mutations carry one request ID through a bounded retry. Uploads use their own API.
export async function editorRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const payload =
    typeof options.body === 'string'
      ? (JSON.parse(options.body) as {
          requestId?: string;
          operation?: string;
          id?: string;
        })
      : null;
  const mutation = Boolean(payload?.requestId);
  const expectedId =
    payload?.id ?? decodeURIComponent(path.split('/')[2] ?? '');
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    let result: {
      ok?: boolean;
      id?: string;
      revision?: number;
      baseRevision?: number;
      url?: string;
      publishedAt?: string;
      updatedAt?: string;
      deletedAt?: string | null;
      error?: string;
    };
    try {
      response = await fetch(`/api/content/editor${path}`, {
        ...options,
        headers,
        credentials: 'same-origin',
      });
      if (response.status >= 500)
        throw new Error('서버 응답을 확인하지 못했습니다.');
      result = (await response.json()) as typeof result;
      if (!result || typeof result !== 'object')
        throw new Error('Invalid response');
    } catch {
      if (mutation && attempt === 0) continue;
      throw new Error(
        mutation
          ? '저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 연결이 복구되면 내 글에서 저장 상태를 확인해 주세요.'
          : '편집기 응답을 확인하지 못했습니다. 다시 시도해 주세요.'
      );
    }
    if (!response.ok)
      throw new Error(
        result.error ?? `편집기 요청 실패 (${String(response.status)})`
      );
    if (
      mutation &&
      (result.ok !== true ||
        result.id !== expectedId ||
        (payload?.operation &&
          (!Number.isInteger(result.revision) ||
            Number(result.revision) < 1)) ||
        (payload?.operation === 'save' &&
          (!Number.isInteger(result.baseRevision) ||
            Number(result.baseRevision) < 0)) ||
        (payload?.operation === 'publish' &&
          (typeof result.url !== 'string' ||
            typeof result.publishedAt !== 'string' ||
            typeof result.updatedAt !== 'string')) ||
        (options.method === 'DELETE' && typeof result.deletedAt !== 'string') ||
        (path.endsWith('/restore') && result.deletedAt !== null))
    )
      throw new Error(
        '저장 확인 응답이 올바르지 않습니다. 내 글에서 저장 상태를 확인해 주세요.'
      );
    return result as T;
  }
}
