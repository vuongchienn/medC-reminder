import { getDb } from './db.js';

export async function runMigrations() {
  const db = getDb();

  await db.exec(`
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

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      display_name VARCHAR(120) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicine_schedules (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      time_of_day VARCHAR(10) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      scheduled_time TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      actual_taken_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminder_history (
      id SERIAL PRIMARY KEY,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
      medicine_name VARCHAR(255) NOT NULL,
      scheduled_time TIMESTAMPTZ NOT NULL,
      actual_taken_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_notifications (
      reminder_id INTEGER PRIMARY KEY REFERENCES reminders(id) ON DELETE CASCADE,
      sent_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_notification_events (
      reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
      stage VARCHAR(20) NOT NULL,
      sent_at TIMESTAMP NOT NULL,
      PRIMARY KEY (reminder_id, stage)
    );
  `);

  await db.exec(`
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE reminder_history ADD COLUMN IF NOT EXISTS skipped_reason TEXT;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS cycle_days INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS break_days INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS shopping_needed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE medicines ADD COLUMN IF NOT EXISTS low_stock_alerted_at TIMESTAMP;
  `);

  await db.exec(`
    INSERT INTO settings(key, value)
    VALUES ('dark_mode', 'false')
    ON CONFLICT (key) DO NOTHING;
  `);
}
