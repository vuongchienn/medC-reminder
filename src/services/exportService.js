import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Export medicine history as CSV.
 * @returns {string}
 */
export function exportHistoryCsv() {
  const rows = db.prepare(`
    SELECT medicine_name, scheduled_time, actual_taken_at, status
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();

  const headers = ['medicine_name', 'scheduled_time', 'actual_taken_at', 'status'];
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const values = headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`);
    lines.push(values.join(','));
  });
  return lines.join('\n');
}

/**
 * Export history as JSON.
 * @returns {string}
 */
export function exportHistoryJson() {
  const rows = db.prepare(`
    SELECT medicine_name, scheduled_time, actual_taken_at, status
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();
  return JSON.stringify(rows, null, 2);
}

/**
 * Export full backup as JSON.
 * @returns {string}
 */
export function exportBackup() {
  return JSON.stringify({
    medicines: db.prepare('SELECT * FROM medicines').all(),
    schedules: db.prepare('SELECT * FROM medicine_schedules').all(),
    reminders: db.prepare('SELECT * FROM reminders').all(),
    history: db.prepare('SELECT * FROM reminder_history').all(),
    settings: db.prepare('SELECT * FROM settings').all()
  }, null, 2);
}
