import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Export medicine history as CSV.
 */
export async function exportHistoryCsv() {
  const rows = await db.prepare(`
    SELECT
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();

  const headers = [
    'medicine_name',
    'scheduled_time',
    'actual_taken_at',
    'status'
  ];

  const lines = [headers.join(',')];

  rows.forEach((row) => {
    const values = headers.map((header) =>
      `"${String(row[header] ?? '').replace(/"/g, '""')}"`
    );

    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Export history as JSON.
 */
export async function exportHistoryJson() {
  const rows = await db.prepare(`
    SELECT
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();

  return JSON.stringify(rows, null, 2);
}

/**
 * Export full backup.
 */
export async function exportBackup() {
  const medicines = await db.prepare(
    'SELECT * FROM medicines'
  ).all();

  const schedules = await db.prepare(
    'SELECT * FROM medicine_schedules'
  ).all();

  const reminders = await db.prepare(
    'SELECT * FROM reminders'
  ).all();

  const history = await db.prepare(
    'SELECT * FROM reminder_history'
  ).all();

  const settings = await db.prepare(
    'SELECT * FROM settings'
  ).all();

  return JSON.stringify(
    {
      medicines,
      schedules,
      reminders,
      history,
      settings
    },
    null,
    2
  );
}