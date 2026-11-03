import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-lists-'));
  const app = createApp({ db: openDb(dir), photosDir: path.join(dir, 'photos') });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, body, email = 'ana@example.com') {
  const res = await fetch(base + '/api' + url, {
    method,
    headers: { 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

test('first shopping trip: no prices, then prices are written down', async () => {
  const { body: list } = await call('POST', '/lists', { name: 'Primera', store: 'Coto' });
  let l = (await call('POST', `/lists/${list.id}/items`, { name: 'Leche', quantity: 2 })).body;
  l = (await call('POST', `/lists/${list.id}/items`, { name: 'Pan' })).body;
  assert.equal(l.items.length, 2);
  assert.equal(l.estimated_total, 0);
  assert.equal(l.items_without_price, 2);

  const leche = l.items.find((i) => i.name === 'Leche');
  l = (await call('POST', `/lists/${list.id}/items/${leche.id}/price`, { price: 1000 })).body;
  assert.equal(l.items.find((i) => i.name === 'Leche').checked, 1);
  assert.equal(l.estimated_total, 2000);
  assert.equal(l.spent_total, 2000);
  assert.equal(l.items_without_price, 1);

  // Correcting the price on the same list replaces it rather than adding a record.
  l = (await call('POST', `/lists/${list.id}/items/${leche.id}/price`, { price: 1100 }, 'beto@example.com')).body;
  assert.equal(l.estimated_total, 2200);
  const { body: hist } = await call('GET', `/products/${leche.product_id}/prices`);
  assert.equal(hist.history.length, 1);
  assert.equal(hist.history[0].recorded_by, 'beto');
  assert.equal(hist.history[0].store, 'Coto');

  await call('PATCH', `/lists/${list.id}`, { status: 'done' });
});

test('second trip: copy the earlier list, estimate from last prices, record a promo', async () => {
  const lists = (await call('GET', '/lists')).body;
  const first = lists.find((x) => x.name === 'Primera');
  assert.equal(first.status, 'done');
  assert.ok(first.closed_at);

  let l = (await call('POST', '/lists', { copy_from: first.id })).body;
  assert.equal(l.store, 'Coto');
  assert.deepEqual(l.items.map((i) => [i.name, i.quantity]), [['Leche', 2], ['Pan', 1]]);
  assert.equal(l.estimated_total, 2200, 'uses the price from the previous trip');

  const leche = l.items.find((i) => i.name === 'Leche');
  assert.equal(leche.last_price, 1100);
  assert.equal(leche.price, null);

  l = (await call('PATCH', `/lists/${l.id}/items/${leche.id}`, { quantity: 3 })).body;
  assert.equal(l.estimated_total, 3300);

  l = (await call('POST', `/lists/${l.id}/items/${leche.id}/price`,
    { price: 900, regular_price: 1300, promo: '30% la segunda' })).body;
  assert.equal(l.estimated_total, 2700);

  const { body: hist } = await call('GET', `/products/${leche.product_id}/prices`);
  assert.deepEqual(hist.history.map((h) => [h.price, h.promo, h.change_pct]),
    [[1100, null, null], [900, '30% la segunda', 18.2]]);

  // Next trip: the promo may not be there, so the estimate uses the regular price.
  const next = (await call('POST', '/lists', { copy_from: l.id })).body;
  const leche2 = next.items.find((i) => i.name === 'Leche');
  assert.equal(leche2.last_price, 900);
  assert.equal(leche2.subtotal, 3900);
});

test('adding an existing product by name reuses it and sums quantity', async () => {
  const { body: list } = await call('POST', '/lists', { name: 'Otra' });
  await call('POST', `/lists/${list.id}/items`, { name: 'leche' });
  const l = (await call('POST', `/lists/${list.id}/items`, { name: 'LECHE', quantity: 2 })).body;
  assert.equal(l.items.length, 1);
  assert.equal(l.items[0].quantity, 3);
  const products = (await call('GET', '/products')).body;
  assert.equal(products.filter((p) => p.name.toLowerCase() === 'leche').length, 1);
});

test('validates input', async () => {
  const { body: list } = await call('POST', '/lists', {});
  assert.match(list.name, /^Compra /);
  assert.equal((await call('POST', `/lists/${list.id}/items`, { name: 'X', quantity: 0 })).status, 400);
  const l = (await call('POST', `/lists/${list.id}/items`, { name: 'X' })).body;
  assert.equal((await call('POST', `/lists/${list.id}/items/${l.items[0].id}/price`, { price: 'abc' })).status, 400);
  assert.equal((await call('GET', '/lists/9999')).status, 404);
  assert.equal((await call('DELETE', `/lists/${list.id}`)).status, 204);
});
