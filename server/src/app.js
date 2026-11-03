import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { identify } from './auth.js';

const PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function createApp({ db, photosDir, webDir, devUserEmail }) {
  fs.mkdirSync(photosDir, { recursive: true });
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(identify(db, { devUserEmail }));

  api.get('/me', (req, res) => res.json(req.user));

  // Products, each with its most recent price (null until someone records one).
  const listProducts = db.prepare(`
    SELECT p.*,
      (SELECT price FROM price_records r WHERE r.product_id = p.id
        ORDER BY recorded_at DESC, id DESC LIMIT 1) AS last_price
    FROM products p
    WHERE p.archived = 0
    ORDER BY p.name COLLATE NOCASE
  `);
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');

  api.get('/products', (req, res) => res.json(listProducts.all()));

  api.post('/products', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    try {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO products (name, unit, notes, created_by) VALUES (?, ?, ?, ?)')
        .run(name, req.body.unit || null, req.body.notes || null, req.user.id);
      res.status(201).json(getProduct.get(lastInsertRowid));
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Ya existe un producto con ese nombre' });
      }
      throw err;
    }
  });

  api.patch('/products/:id', (req, res) => {
    const product = getProduct.get(req.params.id);
    if (!product) return res.status(404).json({ error: 'No existe' });
    const next = { ...product, ...pick(req.body, ['name', 'unit', 'notes', 'archived']) };
    db.prepare('UPDATE products SET name = ?, unit = ?, notes = ?, archived = ? WHERE id = ?')
      .run(String(next.name).trim(), next.unit || null, next.notes || null, next.archived ? 1 : 0, product.id);
    res.json(getProduct.get(product.id));
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: photosDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + PHOTO_TYPES[file.mimetype]),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype in PHOTO_TYPES),
  });

  api.post('/products/:id/photo', upload.single('photo'), (req, res) => {
    const product = getProduct.get(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'Falta la foto (jpg, png o webp)' });
    if (!product) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(404).json({ error: 'No existe' });
    }
    db.prepare('UPDATE products SET photo = ? WHERE id = ?').run(req.file.filename, product.id);
    if (product.photo) fs.rmSync(path.join(photosDir, product.photo), { force: true });
    res.json(getProduct.get(product.id));
  });

  app.use('/api', api);
  app.use('/photos', express.static(photosDir, { maxAge: '30d', immutable: true }));

  // Built frontend; any non-API route falls back to index.html.
  if (webDir && fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/(api|photos)\/).*/, (req, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Error interno' });
  });

  return app;
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj && k in obj).map((k) => [k, obj[k]]));
}
