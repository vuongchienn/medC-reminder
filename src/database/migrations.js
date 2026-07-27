import { getDb } from './db.js';

export function runMigrations() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      time_of_day TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actual_taken_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminder_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
}
