async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, options);
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body;
}

const json = (method, data) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  me: () => request('/me'),
  products: () => request('/products'),
  createProduct: (data) => request('/products', json('POST', data)),
  updateProduct: (id, data) => request(`/products/${id}`, json('PATCH', data)),
  prices: (id) => request(`/products/${id}/prices`),
  lists: () => request('/lists'),
  list: (id) => request(`/lists/${id}`),
  createList: (data) => request('/lists', json('POST', data)),
  updateList: (id, data) => request(`/lists/${id}`, json('PATCH', data)),
  deleteList: (id) => request(`/lists/${id}`, { method: 'DELETE' }),
  addItem: (id, data) => request(`/lists/${id}/items`, json('POST', data)),
  updateItem: (id, itemId, data) => request(`/lists/${id}/items/${itemId}`, json('PATCH', data)),
  removeItem: (id, itemId) => request(`/lists/${id}/items/${itemId}`, { method: 'DELETE' }),
  recordPrice: (id, itemId, data) => request(`/lists/${id}/items/${itemId}/price`, json('POST', data)),
  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return request(`/products/${id}/photo`, { method: 'POST', body: form });
  },
};

export const money = (n) =>
  n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

export const date = (s) =>
  s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').toLocaleDateString('es-AR') : '';
