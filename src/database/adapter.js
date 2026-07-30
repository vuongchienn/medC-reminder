import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import pg from 'pg';

dotenv.config();

// DATE (OID 1082): giữ nguyên dạng chuỗi "YYYY-MM-DD" thay vì để pg tự
// convert thành JS Date object (gây lệch ngày / NaN khi code xử lý bằng string,
// ví dụ isMedicineOnCycle trong reminderService.js).
pg.types.setTypeParser(1082, (value) => value);

const { Pool } = pg;

function getPostgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (connectionString) {
    try {
      const parsed = new URL(connectionString);
      return {
        host: parsed.hostname,
        port: Number(parsed.port || 5432),
        database: parsed.pathname.replace(/^\/+/, ''),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      };
    } catch (error) {
      console.warn(`Invalid DATABASE_URL, falling back to DB_* variables: ${error.message}`);
    }
  }

  return {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.DB_NAME || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE || 'postgres',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
}

let connection = null;



async function getPostgresConnection() {
  const config = getPostgresConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl
  });

  return {
    type: 'postgres',
    connection: pool,
    async exec(sql) {
      await pool.query(sql);
    },
    prepare(sql) {
      const placeholderSql = sql.replace(/\?/g, (match, offset, full) => {
        const count = full.slice(0, offset).split('?').length - 1;
        return `$${count + 1}`;
      });
      return {
        async run(...params) {
          const result = await pool.query(placeholderSql, params);
          const rowId = result.rows[0]?.id ?? null;
          return { lastInsertRowid: rowId ?? 0, changes: result.rowCount ?? 0 };
        },
        async get(...params) {
          const result = await pool.query(placeholderSql, params);
          return result.rows[0] || null;
        },
        async all(...params) {
          const result = await pool.query(placeholderSql, params);
          return result.rows;
        }
      };
    },
    async close() {
      await pool.end();
    }
  };
}

export async function initDatabase() {
  connection = await getPostgresConnection();
  return connection;
}

export function getDb() {
  if (!connection) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return connection;
}

export async function closeDb() {
  if (connection) {
    await connection.close();
  }
}