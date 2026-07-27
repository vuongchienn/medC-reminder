import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Create reminders for the current minute based on active medicines and schedules.
 */
export async function generateRemindersForNow() {
  const now = new Date();

  const currentTime =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const dateKey = now.toISOString().split('T')[0];

  const activeMedicines = await db.prepare(`
    SELECT
      m.id,
      m.name,
      m.dosage,
      m.unit
    FROM medicines m
    WHERE m.active = TRUE
      AND (m.end_date IS NULL OR m.end_date >= ?)
      AND m.start_date <= ?
  `).all(dateKey, dateKey);

  const reminders = [];

  for (const medicine of activeMedicines) {
    const schedules = await db.prepare(`
      SELECT
        id,
        time_of_day,
        enabled
      FROM medicine_schedules
      WHERE medicine_id = ?
        AND enabled = TRUE
    `).all(medicine.id);

    for (const schedule of schedules) {
      if (schedule.time_of_day !== currentTime) {
        continue;
      }

      const scheduledTime = `${dateKey}T${currentTime}`;

      const existing = await db.prepare(`
        SELECT id
        FROM reminders
        WHERE medicine_id = ?
          AND scheduled_time = ?
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(
        medicine.id,
        scheduledTime
      );

      if (existing) {
        continue;
      }

      const inserted = await db.prepare(`
        INSERT INTO reminders (
          medicine_id,
          scheduled_time,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, 'pending', ?, ?)
        RETURNING id
      `).get(
        medicine.id,
        scheduledTime,
        new Date().toISOString(),
        new Date().toISOString()
      );

      reminders.push({
        id: inserted.id,
        medicineId: medicine.id,
        medicineName: medicine.name,
        dosage: medicine.dosage,
        unit: medicine.unit,
        scheduledTime
      });
    }
  }

  return reminders;
}

/**
 * List reminders.
 */
export async function getReminders(filters = {}) {
  let query = `
    SELECT
      r.*,
      m.name AS medicine_name,
      m.dosage,
      m.unit
    FROM reminders r
    JOIN medicines m
      ON m.id = r.medicine_id
    WHERE 1=1
  `;

  const params = [];

  if (filters.status) {
    query += ` AND r.status = ?`;
    params.push(filters.status);
  }

  query += `
    ORDER BY r.scheduled_time DESC
  `;

  return await db.prepare(query).all(...params);
}

/**
 * Mark reminder as taken.
 */
export async function markReminderTaken(reminderId) {
  const reminder = await db.prepare(`
    SELECT *
    FROM reminders
    WHERE id = ?
  `).get(reminderId);

  if (!reminder) {
    return null;
  }

  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE reminders
    SET
      status = 'taken',
      actual_taken_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    now,
    now,
    reminderId
  );

  const medicine = await db.prepare(`
    SELECT name
    FROM medicines
    WHERE id = ?
  `).get(reminder.medicine_id);

  await db.prepare(`
    INSERT INTO reminder_history (
      medicine_id,
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, 'taken', ?)
  `).run(
    reminder.medicine_id,
    medicine?.name || 'Unknown',
    reminder.scheduled_time,
    now,
    now
  );

  return {
    id: reminderId,
    status: 'taken'
  };
}

/**
 * Snooze reminder for 10 minutes.
 */
export async function snoozeReminder(reminderId) {
  const reminder = await db.prepare(`
    SELECT *
    FROM reminders
    WHERE id = ?
  `).get(reminderId);

  if (!reminder) {
    return null;
  }

  const now = new Date();

  now.setMinutes(now.getMinutes() + 10);

  const newTime =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const dateKey = now.toISOString().split('T')[0];

  const scheduledTime = `${dateKey}T${newTime}`;

  const inserted = await db.prepare(`
    INSERT INTO reminders (
      medicine_id,
      scheduled_time,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'pending', ?, ?)
    RETURNING id
  `).get(
    reminder.medicine_id,
    scheduledTime,
    now.toISOString(),
    now.toISOString()
  );

  return {
    id: inserted.id,
    scheduledTime
  };
}