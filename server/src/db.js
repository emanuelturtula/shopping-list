import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Each entry upgrades the schema by one version. Never edit an existing entry
// once it has been deployed; append a new one instead.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE products (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    unit       TEXT,                       -- e.g. "kg", "unidad", "pack x6"
    notes      TEXT,
    photo      TEXT,                       -- file name inside the photos dir
    archived   INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX products_name ON products(lower(name));

  CREATE TABLE lists (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    store      TEXT,
    status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shopping','done')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at  TEXT
  );

  CREATE TABLE list_items (
    id         INTEGER PRIMARY KEY,
    list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity   REAL NOT NULL DEFAULT 1,
    checked    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (list_id, product_id)
  );

  -- One row each time someone writes down a price at the store.
  CREATE TABLE price_records (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    list_id     INTEGER REFERENCES lists(id) ON DELETE SET NULL,
    price       REAL NOT NULL,             -- unit price actually paid
    regular_price REAL,                    -- price without promo, if there was one
    promo       TEXT,                      -- e.g. "2x1", "30% off la segunda"
    store       TEXT,
    recorded_by INTEGER REFERENCES users(id),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX price_records_product ON price_records(product_id, recorded_at);
  `,
];

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'shopping.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
