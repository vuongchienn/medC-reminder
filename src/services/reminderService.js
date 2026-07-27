import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Create reminders for the current minute based on active medicines and schedules.
 * @returns {Array<object>}
 */
export function generateRemindersForNow() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateKey = now.toISOString().split('T')[0];

  const activeMedicines = db.prepare(`
    SELECT m.id, m.name, m.dosage, m.unit
    FROM medicines m
    WHERE m.active = 1
      AND (m.end_date IS NULL OR m.end_date >= ?)
      AND m.start_date <= ?
  `).all(dateKey, dateKey);

  const reminders = [];
  for (const medicine of activeMedicines) {
    const schedules = db.prepare(`
      SELECT id, time_of_day, enabled
      FROM medicine_schedules
      WHERE medicine_id = ? AND enabled = 1
    `).all(medicine.id);

    for (const schedule of schedules) {
      if (schedule.time_of_day === currentTime) {
        const existing = db.prepare(`
          SELECT id FROM reminders
          WHERE medicine_id = ? AND scheduled_time = ? AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1
        `).get(medicine.id, `${dateKey}T${currentTime}`);

        if (!existing) {
          const result = db.prepare(`
            INSERT INTO reminders (medicine_id, scheduled_time, status, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, ?)
          `).run(medicine.id, `${dateKey}T${currentTime}`, new Date().toISOString(), new Date().toISOString());
          reminders.push({ id: result.lastInsertRowid, medicineId: medicine.id, medicineName: medicine.name, dosage: medicine.dosage, unit: medicine.unit, scheduledTime: `${dateKey}T${currentTime}` });
        }
      }
    }
  }

  return reminders;
}

/**
 * List reminders.
 * @param {object} filters
 * @returns {Array<object>}
 */
export function getReminders(filters = {}) {
  let query = `
    SELECT r.*, m.name AS medicine_name, m.dosage, m.unit
    FROM reminders r
    JOIN medicines m ON m.id = r.medicine_id
    WHERE 1=1
  `;
  const params = [];

  if (filters.status) {
    query += ' AND r.status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY r.scheduled_time DESC';
  return db.prepare(query).all(...params);
}

/**
 * Mark reminder as taken.
 * @param {number} reminderId
 * @returns {object|null}
 */
export function markReminderTaken(reminderId) {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE reminders
    SET status = 'taken', actual_taken_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, reminderId);

  const medicine = db.prepare('SELECT name FROM medicines WHERE id = ?').get(reminder.medicine_id);
  db.prepare(`
    INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
    VALUES (?, ?, ?, ?, 'taken', ?)
  `).run(reminder.medicine_id, medicine?.name || 'Unknown', reminder.scheduled_time, now, now);

  return { id: reminderId, status: 'taken' };
}

/**
 * Snooze a reminder for 10 minutes by creating a new reminder.
 * @param {number} reminderId
 * @returns {object|null}
 */
export function snoozeReminder(reminderId) {
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  if (!reminder) return null;

  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  const newTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateKey = now.toISOString().split('T')[0];
  const result = db.prepare(`
    INSERT INTO reminders (medicine_id, scheduled_time, status, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?)
  `).run(reminder.medicine_id, `${dateKey}T${newTime}`, now.toISOString(), now.toISOString());

  return { id: result.lastInsertRowid, scheduledTime: `${dateKey}T${newTime}` };
}
