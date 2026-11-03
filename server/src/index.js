import path from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const dataDir = process.env.DATA_DIR || path.resolve('data');
const port = Number(process.env.PORT || 8080);

const db = openDb(dataDir);
const app = createApp({
  db,
  photosDir: path.join(dataDir, 'photos'),
  webDir: process.env.WEB_DIR || path.resolve('../web/dist'),
  devUserEmail: process.env.DEV_USER_EMAIL,
});

app.listen(port, () => console.log(`shopping-list escuchando en :${port}`));
