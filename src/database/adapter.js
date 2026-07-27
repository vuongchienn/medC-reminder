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

  const sqliteDb = new DatabaseSync(absoluteDbPath);
  return {
    type: 'sqlite',
    connection: sqliteDb,
    exec(sql) {
      sqliteDb.exec(sql);
    },
    prepare(sql) {
      const statement = sqliteDb.prepare(sql);
      return {
        run(...params) {
          const result = statement.run(...params);
          return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
        },
        get(...params) {
          return statement.get(...params);
        },
        all(...params) {
          return statement.all(...params);
        }
      };
    },
    async close() {
      sqliteDb.close();
    }
  };
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

  return {
    type: 'mysql',
    connection: pool,
    async exec(sql) {
      await pool.query(sql);
    },
    prepare(sql) {
      const toPositional = (params) => params.map((_, index) => `?`).join(', ');
      return {
        async run(...params) {
          const [result] = await pool.query(sql.replace(/\?/g, '?'), params);
          return { lastInsertRowid: result.insertId ?? 0, changes: result.affectedRows ?? 0 };
        },
        async get(...params) {
          const [rows] = await pool.query(sql.replace(/\?/g, '?'), params);
          return rows[0] || null;
        },
        async all(...params) {
          const [rows] = await pool.query(sql.replace(/\?/g, '?'), params);
          return rows;
        }
      };
    },
    async close() {
      await pool.end();
    }
  };
}

async function getPostgresConnection() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

export async function closeDb() {
  if (connection) {
    await connection.close();
  }
}
