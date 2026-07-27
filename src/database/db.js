import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.SQLITE_PATH || './data/medremind.db';
const absoluteDbPath = path.resolve(dbPath);
const dbDir = path.dirname(absoluteDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(absoluteDbPath);

export function getDb() {
  return db;
}

export function closeDb() {
  db.close();
}
