import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { totals } from '../src/lists.js';

let server, base, dir, db;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-edge-'));
  db = openDb(dir);
  const app = createApp({ db, photosDir: path.join(dir, 'photos'), devUserEmail: 'dev@local' });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + '/api' + url, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

describe('auth', () => {
  test('falls back to DEV_USER_EMAIL without the Cloudflare header', async () => {
    assert.equal((await call('GET', '/me')).body.email, 'dev@local');
  });
  test('the Cloudflare header wins over the dev user', async () => {
    const me = await call('GET', '/me', null, { 'cf-access-authenticated-user-email': ' Beto@Example.com ' });
    assert.equal(me.body.email, 'beto@example.com');
    assert.equal(me.body.name, 'beto');
  });
  test('health needs no identity', async () => {
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true });
  });
});

describe('database', () => {
  test('migrations are idempotent when reopening', () => {
    const again = openDb(dir);
    assert.equal(again.pragma('user_version', { simple: true }), 1);
    again.close();
  });
});

describe('products', () => {
  test('requires a name', async () => {
    assert.equal((await call('POST', '/products', { name: '  ' })).status, 400);
  });
  test('404 for unknown product', async () => {
    assert.equal((await call('PATCH', '/products/999', { name: 'x' })).status, 404);
    assert.equal((await call('GET', '/products/999/prices')).status, 404);
  });
  test('archived products are hidden and not copied to new lists', async () => {
    const p = (await call('POST', '/products', { name: 'Vieja' })).body;
    const l = (await call('POST', '/lists', {})).body;
    await call('POST', `/lists/${l.id}/items`, { product_id: p.id });
    await call('PATCH', `/products/${p.id}`, { archived: true });
    assert.ok(!(await call('GET', '/products')).body.some((x) => x.id === p.id));
    const copy = (await call('POST', '/lists', { copy_from: l.id })).body;
    assert.equal(copy.items.length, 0);
  });
  test('adding an archived product by name brings it back', async () => {
    const l = (await call('POST', '/lists', {})).body;
    await call('POST', `/lists/${l.id}/items`, { name: 'vieja' });
    assert.ok((await call('GET', '/products')).body.some((x) => x.name === 'Vieja'));
  });
  test('rejects photos of other types and unknown products', async () => {
    const p = (await call('POST', '/products', { name: 'Foto' })).body;
    const send = async (id, type) => {
      const form = new FormData();
      form.append('photo', new Blob(['x'], { type }), 'f');
      return (await fetch(`${base}/api/products/${id}/photo`, { method: 'POST', body: form })).status;
    };
    assert.equal(await send(p.id, 'text/plain'), 400);
    assert.equal(await send(999, 'image/png'), 404);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'photos')), [], 'no orphan files left behind');
  });
  test('replacing a photo deletes the old file', async () => {
    const p = (await call('POST', '/products', { name: 'Foto2' })).body;
    const send = async () => {
      const form = new FormData();
      form.append('photo', new Blob(['x'], { type: 'image/png' }), 'f.png');
      return (await fetch(`${base}/api/products/${p.id}/photo`, { method: 'POST', body: form })).json();
    };
    const first = await send();
    const second = await send();
    const files = fs.readdirSync(path.join(dir, 'photos'));
    assert.ok(files.includes(second.photo));
    assert.ok(!files.includes(first.photo));
  });
});

describe('lists', () => {
  test('status changes set and clear closed_at, and invalid states are rejected', async () => {
    const l = (await call('POST', '/lists', { name: 'Estados' })).body;
    assert.equal((await call('PATCH', `/lists/${l.id}`, { status: 'otro' })).status, 400);
    const done = (await call('PATCH', `/lists/${l.id}`, { status: 'done' })).body;
    assert.ok(done.closed_at);
    const again = (await call('PATCH', `/lists/${l.id}`, { status: 'done' })).body;
    assert.equal(again.closed_at, done.closed_at, 'keeps the first closing time');
    const reopened = (await call('PATCH', `/lists/${l.id}`, { status: 'shopping' })).body;
    assert.equal(reopened.closed_at, null);
  });
  test('updates name and store, keeps name if blank', async () => {
    const l = (await call('POST', '/lists', { name: 'A', store: 'Dia' })).body;
    let u = (await call('PATCH', `/lists/${l.id}`, { name: '  ', store: '' })).body;
    assert.equal(u.name, 'A');
    assert.equal(u.store, null);
    u = (await call('PATCH', `/lists/${l.id}`, { name: 'B' })).body;
    assert.equal(u.name, 'B');
  });
  test('copying from a missing list is a 404', async () => {
    assert.equal((await call('POST', '/lists', { copy_from: 999 })).status, 404);
  });
  test('item errors', async () => {
    const l = (await call('POST', '/lists', {})).body;
    assert.equal((await call('POST', `/lists/${l.id}/items`, {})).status, 400);
    assert.equal((await call('POST', `/lists/${l.id}/items`, { product_id: 999 })).status, 404);
    assert.equal((await call('PATCH', `/lists/${l.id}/items/999`, { quantity: 2 })).status, 404);
    assert.equal((await call('POST', `/lists/${l.id}/items/999/price`, { price: 1 })).status, 404);
    const withItem = (await call('POST', `/lists/${l.id}/items`, { name: 'Arroz' })).body;
    const id = withItem.items[0].id;
    assert.equal((await call('PATCH', `/lists/${l.id}/items/${id}`, { quantity: -1 })).status, 400);
    assert.equal((await call('POST', `/lists/${l.id}/items/${id}/price`, { price: -5 })).status, 400);
    assert.equal((await call('POST', `/lists/${l.id}/items/${id}/price`, {})).status, 400);
    assert.equal((await call('POST', `/lists/${l.id}/items/${id}/price`, { price: 0 })).status, 200, 'free is allowed');
  });
  test('an item from another list cannot be edited through this one', async () => {
    const a = (await call('POST', '/lists', {})).body;
    const b = (await call('POST', '/lists', {})).body;
    const item = (await call('POST', `/lists/${a.id}/items`, { name: 'Ajeno' })).body.items[0];
    assert.equal((await call('PATCH', `/lists/${b.id}/items/${item.id}`, { quantity: 5 })).status, 404);
  });
  test('removing items and unchecking', async () => {
    const l = (await call('POST', '/lists', {})).body;
    const item = (await call('POST', `/lists/${l.id}/items`, { name: 'Fideos' })).body.items[0];
    await call('POST', `/lists/${l.id}/items/${item.id}/price`, { price: 500 });
    let d = (await call('PATCH', `/lists/${l.id}/items/${item.id}`, { checked: false })).body;
    assert.equal(d.items[0].checked, 0);
    d = (await call('DELETE', `/lists/${l.id}/items/${item.id}`)).body;
    assert.equal(d.items.length, 0);
  });
  test('deleting a list keeps its prices in the history', async () => {
    const l = (await call('POST', '/lists', {})).body;
    const item = (await call('POST', `/lists/${l.id}/items`, { name: 'Azúcar' })).body.items[0];
    await call('POST', `/lists/${l.id}/items/${item.id}/price`, { price: 700 });
    await call('DELETE', `/lists/${l.id}`);
    const h = (await call('GET', `/products/${item.product_id}/prices`)).body.history;
    assert.equal(h.length, 1);
    assert.equal(h[0].list_id, null);
  });
  test('prices from deleted lists still feed the estimate', async () => {
    const l = (await call('POST', '/lists', {})).body;
    const d = (await call('POST', `/lists/${l.id}/items`, { name: 'Azúcar', quantity: 2 })).body;
    assert.equal(d.estimated_total, 1400);
  });
  test('the most recent list comes first', async () => {
    const newest = (await call('POST', '/lists', { name: 'Última' })).body;
    assert.equal((await call('GET', '/lists')).body[0].id, newest.id);
  });
});

describe('totals', () => {
  test('sums estimates, counts missing prices, and only counts recorded prices as spent', () => {
    assert.deepEqual(totals([
      { quantity: 2, price: 100, subtotal: 200 },
      { quantity: 1, price: null, subtotal: 50 },
      { quantity: 3, price: null, subtotal: null },
    ]), { estimated_total: 250, spent_total: 200, items_without_price: 1 });
  });
  test('rounds to cents', () => {
    assert.equal(totals([{ quantity: 3, price: 0.1, subtotal: 0.3 }]).spent_total, 0.3);
  });
});
