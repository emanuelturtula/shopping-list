import { vi } from 'vitest';

// Replaces fetch with a tiny router: routes['POST /api/lists'] = (body, url) => response.
// Returns the list of calls made, as [method, path, body].
export function fakeApi(routes) {
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    calls.push([method, url, body]);
    const handler = routes[`${method} ${url}`];
    if (!handler) return json({ error: `sin ruta ${method} ${url}` }, 404);
    const result = await handler(body, url);
    return result instanceof Response ? result : json(result);
  });
  return calls;
}

export function json(data, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
}
