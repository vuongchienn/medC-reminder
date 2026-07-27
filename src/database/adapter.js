import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

let connection = null;
let dbType = process.env.DB_TYPE || 'sqlite';

function getSqliteConnection() {
  const dbPath = process.env.SQLITE_PATH || './data/medremind.db';
  const absoluteDbPath = path.resolve(dbPath);
  const dbDir = path.dirname(absoluteDbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return new DatabaseSync(absoluteDbPath);
}

async function getMysqlConnection() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

async function getPostgresConnection() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  return pool;
}

export async function initDatabase() {
  dbType = process.env.DB_TYPE || 'sqlite';
  if (dbType === 'mysql') {
    connection = await getMysqlConnection();
    return { type: 'mysql', connection };
  }
  if (dbType === 'postgres') {
    connection = await getPostgresConnection();
    return { type: 'postgres', connection };
  }

  connection = getSqliteConnection();
  return { type: 'sqlite', connection };
}

export function getDb() {
  if (!connection) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return connection;
}

export function closeDb() {
  if (connection && dbType === 'sqlite') {
    connection.close();
  }
  if (connection && dbType === 'mysql') {
    connection.end();
  }
  if (connection && dbType === 'postgres') {
    connection.end();
  }
}
