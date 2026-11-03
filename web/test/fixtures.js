export const item = (over = {}) => ({
  id: 1, product_id: 10, quantity: 2, checked: 0, name: 'Leche', unit: 'litro', photo: null,
  price: null, promo: null, regular_price: null,
  last_price: 1000, last_promo: null, last_price_at: '2026-10-01 12:00:00', subtotal: 2000,
  ...over,
});

export const list = (over = {}) => ({
  id: 5, name: 'Compra semanal', store: 'Coto', status: 'draft', created_at: '2026-11-01 10:00:00',
  closed_at: null, items: [item()], estimated_total: 2000, spent_total: 0, items_without_price: 0,
  ...over,
});
