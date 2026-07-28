import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Export medicine history as CSV.
 */
export async function exportHistoryCsv(userId) {
  const rows = await db.prepare(`
    SELECT
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status
    FROM reminder_history h JOIN medicines m ON m.id = h.medicine_id
    WHERE m.user_id = ?
    ORDER BY h.created_at DESC
  `).all(userId);

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
export async function exportHistoryJson(userId) {
  const rows = await db.prepare(`
    SELECT
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status
    FROM reminder_history h JOIN medicines m ON m.id = h.medicine_id
    WHERE m.user_id = ?
    ORDER BY h.created_at DESC
  `).all(userId);

  return JSON.stringify(rows, null, 2);
}

/**
 * Export full backup.
 */
export async function exportBackup(userId) {
  const medicines = await db.prepare(
    'SELECT * FROM medicines WHERE user_id = ?'
  ).all(userId);

  const schedules = await db.prepare(
    'SELECT s.* FROM medicine_schedules s JOIN medicines m ON m.id = s.medicine_id WHERE m.user_id = ?'
  ).all(userId);

  const reminders = await db.prepare(
    'SELECT r.* FROM reminders r JOIN medicines m ON m.id = r.medicine_id WHERE m.user_id = ?'
  ).all(userId);

  const history = await db.prepare(
    'SELECT h.* FROM reminder_history h JOIN medicines m ON m.id = h.medicine_id WHERE m.user_id = ?'
  ).all(userId);

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
