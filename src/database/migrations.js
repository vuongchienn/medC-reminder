import { getDb } from './db.js';

function isSqlite(db) {
  return db && typeof db.exec === 'function' && typeof db.prepare === 'function';
}

export function runMigrations() {
  const db = getDb();

  if (isSqlite(db)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        dosage TEXT,
        unit TEXT,
        notes TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS medicine_schedules (
        id INTEGER PRIMARY KEY,
        medicine_id INTEGER NOT NULL,
        time_of_day TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY,
        medicine_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        actual_taken_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reminder_history (
        id INTEGER PRIMARY KEY,
        medicine_id INTEGER NOT NULL,
        medicine_name TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        actual_taken_at TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    db.prepare(`
      INSERT OR IGNORE INTO settings(key, value) VALUES ('dark_mode', 'false')
    `).run();
    return;
  }

  const client = db;
  const createSql = `
    CREATE TABLE IF NOT EXISTS medicines (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      dosage VARCHAR(100),
      unit VARCHAR(50),
      notes TEXT,
      start_date DATE NOT NULL,
      end_date DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicine_schedules (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL,
      time_of_day VARCHAR(10) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL,
      scheduled_time TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      actual_taken_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminder_history (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL,
      medicine_name VARCHAR(255) NOT NULL,
      scheduled_time TIMESTAMP NOT NULL,
      actual_taken_at TIMESTAMP,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;

  if (process.env.DB_TYPE === 'mysql') {
    return client.query(createSql);
  }

  return client.query(createSql);
}
