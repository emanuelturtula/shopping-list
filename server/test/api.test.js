import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-'));
  const app = createApp({ db: openDb(dir), photosDir: path.join(dir, 'photos') });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const as = (email) => ({ 'cf-access-authenticated-user-email': email, 'content-type': 'application/json' });

test('rejects requests without an identity', async () => {
  const res = await fetch(`${base}/api/me`);
  assert.equal(res.status, 401);
});

test('creates the user on first visit', async () => {
  const res = await fetch(`${base}/api/me`, { headers: as('Ana@Example.com') });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).email, 'ana@example.com');
});

test('creates, lists and renames products', async () => {
  const created = await fetch(`${base}/api/products`, {
    method: 'POST', headers: as('ana@example.com'), body: JSON.stringify({ name: 'Leche', unit: 'litro' }),
  });
  assert.equal(created.status, 201);
  const product = await created.json();

  const dup = await fetch(`${base}/api/products`, {
    method: 'POST', headers: as('ana@example.com'), body: JSON.stringify({ name: 'leche' }),
  });
  assert.equal(dup.status, 409);

  await fetch(`${base}/api/products/${product.id}`, {
    method: 'PATCH', headers: as('ana@example.com'), body: JSON.stringify({ name: 'Leche entera' }),
  });
  const list = await (await fetch(`${base}/api/products`, { headers: as('ana@example.com') })).json();
  assert.deepEqual(list.map((p) => [p.name, p.last_price]), [['Leche entera', null]]);
});

test('uploads a product photo', async () => {
  const product = await (await fetch(`${base}/api/products`, {
    method: 'POST', headers: as('ana@example.com'), body: JSON.stringify({ name: 'Yerba' }),
  })).json();
  const form = new FormData();
  form.append('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'yerba.jpg');
  const res = await fetch(`${base}/api/products/${product.id}/photo`, {
    method: 'POST', headers: { 'cf-access-authenticated-user-email': 'ana@example.com' }, body: form,
  });
  assert.equal(res.status, 200);
  const { photo } = await res.json();
  assert.match(photo, /\.jpg$/);
  assert.equal((await fetch(`${base}/photos/${photo}`)).status, 200);
});
