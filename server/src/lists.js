import express from 'express';

// Shopping lists, their items, and the prices written down while shopping.
export function listsRouter(db) {
  const r = express.Router();

  const getList = db.prepare('SELECT * FROM lists WHERE id = ?');
  const getItem = db.prepare('SELECT * FROM list_items WHERE id = ? AND list_id = ?');

  // Each item with the price recorded on this list (if any) and the last price
  // known from any earlier record. The estimate uses this trip's price if there is
  // one; otherwise the last price without promo, since a promo may not repeat.
  const listItems = db.prepare(`
    SELECT i.id, i.product_id, i.quantity, i.checked,
           p.name, p.unit, p.photo,
           here.price AS price, here.promo AS promo, here.regular_price AS regular_price,
           prev.price AS last_price, prev.regular_price AS last_regular_price, prev.promo AS last_promo, prev.recorded_at AS last_price_at
    FROM list_items i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN price_records here ON here.id = (
      SELECT id FROM price_records WHERE product_id = i.product_id AND list_id = i.list_id
      ORDER BY recorded_at DESC, id DESC LIMIT 1)
    LEFT JOIN price_records prev ON prev.id = (
      SELECT id FROM price_records WHERE product_id = i.product_id
        AND (list_id IS NULL OR list_id <> i.list_id)
      ORDER BY recorded_at DESC, id DESC LIMIT 1)
    WHERE i.list_id = ?
    ORDER BY i.checked, p.name COLLATE NOCASE
  `);

  function detail(list) {
    const items = listItems.all(list.id).map((it) => {
      const unitPrice = it.price ?? it.last_regular_price ?? it.last_price;
      return { ...it, subtotal: unitPrice == null ? null : round(unitPrice * it.quantity) };
    });
    return { ...list, items, ...totals(items) };
  }

  function loadList(req, res) {
    const list = getList.get(req.params.id);
    if (!list) res.status(404).json({ error: 'La lista no existe' });
    return list;
  }

  r.get('/', (req, res) => {
    const lists = db.prepare('SELECT * FROM lists ORDER BY created_at DESC, id DESC').all();
    res.json(lists.map((l) => {
      const { items, ...rest } = detail(l);
      return { ...rest, item_count: items.length };
    }));
  });

  // Creates a list, optionally copying the items and quantities of an earlier one.
  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim() || `Compra ${new Date().toLocaleDateString('es-AR')}`;
    const copyFrom = req.body?.copy_from ? getList.get(req.body.copy_from) : null;
    if (req.body?.copy_from && !copyFrom) return res.status(404).json({ error: 'La lista a copiar no existe' });

    const id = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO lists (name, store, created_by) VALUES (?, ?, ?)')
        .run(name, req.body?.store || copyFrom?.store || null, req.user.id);
      if (copyFrom) {
        db.prepare(`
          INSERT INTO list_items (list_id, product_id, quantity)
          SELECT ?, i.product_id, i.quantity FROM list_items i
          JOIN products p ON p.id = i.product_id AND p.archived = 0
          WHERE i.list_id = ?
        `).run(lastInsertRowid, copyFrom.id);
      }
      return lastInsertRowid;
    })();
    res.status(201).json(detail(getList.get(id)));
  });

  r.get('/:id', (req, res) => {
    const list = loadList(req, res);
    if (list) res.json(detail(list));
  });

  r.patch('/:id', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    const status = req.body?.status ?? list.status;
    if (!['draft', 'shopping', 'done'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
    const name = String(req.body?.name ?? list.name).trim() || list.name;
    const store = 'store' in (req.body ?? {}) ? req.body.store || null : list.store;
    const closedAt = status === 'done' ? (list.closed_at ?? new Date().toISOString()) : null;
    db.prepare('UPDATE lists SET name = ?, store = ?, status = ?, closed_at = ? WHERE id = ?')
      .run(name, store, status, closedAt, list.id);
    res.json(detail(getList.get(list.id)));
  });

  r.delete('/:id', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
    res.status(204).end();
  });

  // Adds a product by id, or by name (creating the product if it is new).
  // Adding a product that is already on the list adds to its quantity.
  r.post('/:id/items', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    const quantity = positive(req.body?.quantity ?? 1);
    if (quantity == null) return res.status(400).json({ error: 'Cantidad inválida' });

    let productId = req.body?.product_id;
    if (!productId) {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'Falta el producto' });
      const existing = db.prepare('SELECT id, archived FROM products WHERE lower(name) = lower(?)').get(name);
      if (existing) {
        if (existing.archived) db.prepare('UPDATE products SET archived = 0 WHERE id = ?').run(existing.id);
        productId = existing.id;
      } else {
        productId = db.prepare('INSERT INTO products (name, created_by) VALUES (?, ?)')
          .run(name, req.user.id).lastInsertRowid;
      }
    } else if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) {
      return res.status(404).json({ error: 'El producto no existe' });
    }

    db.prepare(`
      INSERT INTO list_items (list_id, product_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT (list_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(list.id, productId, quantity);
    res.status(201).json(detail(list));
  });

  r.patch('/:id/items/:itemId', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    const item = getItem.get(req.params.itemId, list.id);
    if (!item) return res.status(404).json({ error: 'El ítem no existe' });
    const quantity = 'quantity' in (req.body ?? {}) ? positive(req.body.quantity) : item.quantity;
    if (quantity == null) return res.status(400).json({ error: 'Cantidad inválida' });
    const checked = 'checked' in (req.body ?? {}) ? (req.body.checked ? 1 : 0) : item.checked;
    db.prepare('UPDATE list_items SET quantity = ?, checked = ? WHERE id = ?').run(quantity, checked, item.id);
    res.json(detail(list));
  });

  r.delete('/:id/items/:itemId', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    db.prepare('DELETE FROM list_items WHERE id = ? AND list_id = ?').run(req.params.itemId, list.id);
    res.json(detail(list));
  });

  // Writes down the price paid for an item on this list and ticks it off.
  // Recording again on the same list replaces the earlier record for that list.
  r.post('/:id/items/:itemId/price', (req, res) => {
    const list = loadList(req, res);
    if (!list) return;
    const item = getItem.get(req.params.itemId, list.id);
    if (!item) return res.status(404).json({ error: 'El ítem no existe' });
    const price = nonNegative(req.body?.price);
    if (price == null) return res.status(400).json({ error: 'Precio inválido' });
    const promo = String(req.body?.promo ?? '').trim() || null;
    const regular = req.body?.regular_price == null || req.body.regular_price === ''
      ? null : nonNegative(req.body.regular_price);

    db.transaction(() => {
      db.prepare('DELETE FROM price_records WHERE product_id = ? AND list_id = ?').run(item.product_id, list.id);
      db.prepare(`INSERT INTO price_records (product_id, list_id, price, regular_price, promo, store, recorded_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(item.product_id, list.id, price, regular, promo, list.store, req.user.id);
      db.prepare('UPDATE list_items SET checked = 1 WHERE id = ?').run(item.id);
    })();
    res.json(detail(list));
  });

  return r;
}

export function totals(items) {
  let estimated = 0;
  let spent = 0;
  let missing = 0;
  for (const it of items) {
    if (it.subtotal == null) missing++;
    else estimated += it.subtotal;
    if (it.price != null) spent += it.price * it.quantity;
  }
  return { estimated_total: round(estimated), spent_total: round(spent), items_without_price: missing };
}

const round = (n) => Math.round(n * 100) / 100;

function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegative(v) {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) && n >= 0 ? n : null;
}
