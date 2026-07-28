import { getDb } from '../database/db.js';

const db = getDb();

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function vietnamDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

async function createReminderIfMissing(medicine, scheduledTime) {
  const existing = await db.prepare(`
    SELECT id FROM reminders
    WHERE medicine_id = ? AND scheduled_time = ?
    LIMIT 1
  `).get(medicine.id, scheduledTime);
  if (existing) return null;

  const now = new Date().toISOString();
  const inserted = await db.prepare(`
    INSERT INTO reminders (medicine_id, scheduled_time, status, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?)
    RETURNING id
  `).get(medicine.id, scheduledTime, now, now);

  await db.prepare(`
    INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
    VALUES (?, ?, ?, NULL, 'pending', ?)
  `).run(medicine.id, medicine.name, scheduledTime, now);

  return {
    id: inserted.id, medicineId: medicine.id, medicineName: medicine.name,
    dosage: medicine.dosage, unit: medicine.unit, scheduledTime
  };
}

async function getActiveMedicinesForDate(dateKey) {
  return db.prepare(`
    SELECT m.id, m.name, m.dosage, m.unit
    FROM medicines m
    WHERE m.active = TRUE
      AND (m.end_date IS NULL OR m.end_date >= ?)
      AND m.start_date <= ?
  `).all(dateKey, dateKey);
}

/** Ensure every active dose for a Vietnam calendar day exists before it is due. */
export async function ensureRemindersForDate(dateKey) {
  const medicines = await getActiveMedicinesForDate(dateKey);
  const created = [];
  for (const medicine of medicines) {
    const schedules = await db.prepare(`
      SELECT time_of_day FROM medicine_schedules
      WHERE medicine_id = ? AND enabled = TRUE
    `).all(medicine.id);
    for (const schedule of schedules) {
      const reminder = await createReminderIfMissing(
        medicine,
        `${dateKey} ${schedule.time_of_day}:00+07:00`
      );
      if (reminder) created.push(reminder);
    }
  }
  return created;
}

/**
 * Create reminders for the current minute based on active medicines and schedules.
 */
export async function generateRemindersForNow() {
  const { dateKey, time: currentTime } = vietnamDateParts();
  const activeMedicines = await getActiveMedicinesForDate(dateKey);

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

      const reminder = await createReminderIfMissing(medicine, `${dateKey} ${currentTime}:00`);
      if (reminder) reminders.push(reminder);
    }
  }

  return reminders;
}

/**
 * List reminders.
 */
export async function getReminders(filters = {}) {
  if (!filters.all) {
    await ensureRemindersForDate(vietnamDateParts().dateKey);
  }
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

  if (!filters.all) {
    const { dateKey } = vietnamDateParts();
    query += ` AND r.scheduled_time >= ? AND r.scheduled_time < ?`;
    params.push(`${dateKey} 00:00:00`, `${dateKey} 23:59:59.999`);
  }

  query += ` ORDER BY r.scheduled_time ASC`;

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

  await db.prepare(`
    UPDATE reminder_history
    SET actual_taken_at = ?, status = 'taken'
    WHERE id = (
      SELECT id FROM reminder_history
      WHERE medicine_id = ? AND scheduled_time = ?
      ORDER BY id DESC LIMIT 1
    )
  `).run(now, reminder.medicine_id, reminder.scheduled_time);

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

  // scheduled_time is a Vietnam wall-clock timestamp. PostgreSQL returns it as
  // a Date, so use its ISO fields as wall-clock fields and add ten minutes there.
  const original = new Date(reminder.scheduled_time);
  if (Number.isNaN(original.getTime())) {
    throw new Error('Invalid scheduled reminder time');
  }
  original.setUTCMinutes(original.getUTCMinutes() + 10);
  const scheduledTime = original.toISOString().slice(0, 19).replace('T', ' ');
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE reminders
    SET scheduled_time = ?, updated_at = ?
    WHERE id = ?
  `).run(scheduledTime, now, reminderId);

  await db.prepare(`
    UPDATE reminder_history
    SET scheduled_time = ?
    WHERE id = (
      SELECT id FROM reminder_history
      WHERE medicine_id = ? AND scheduled_time = ?
      ORDER BY id DESC LIMIT 1
    )
  `).run(scheduledTime, reminder.medicine_id, reminder.scheduled_time);

  return {
    id: reminderId,
    scheduledTime
  };
}

/** Pending doses that are now due in Vietnam time. Used by the free cron endpoint. */
export async function getDueRemindersForNow() {
  return await db.prepare(`
    SELECT
      r.*,
      m.name AS medicine_name,
      m.dosage,
      m.unit
    FROM reminders r
    JOIN medicines m
      ON m.id = r.medicine_id
    WHERE r.status = 'pending'
      AND r.scheduled_time <= NOW()
    ORDER BY r.scheduled_time ASC
  `).all();
}
