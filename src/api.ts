export async function apiJson<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  let body: string | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const { json: _j, ...rest } = init ?? {};
  const r = await fetch(path, {
    ...rest,
    credentials: "include",
    headers,
    body: body ?? rest.body,
  });
  const data = (await r.json()) as T;
  if (!r.ok) {
    const err = (data as { error?: string })?.error ?? r.statusText;
    throw new Error(err);
  }
  return data;
}
