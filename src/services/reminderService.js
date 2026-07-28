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
    SELECT m.id, m.name, m.dosage, m.unit, m.user_id, m.start_date, m.cycle_days, m.break_days
    FROM medicines m
    WHERE m.active = TRUE
      AND (m.end_date IS NULL OR m.end_date >= ?)
      AND m.start_date <= ?
  `).all(dateKey, dateKey);
}

function isMedicineOnCycle(medicine, dateKey) {
  const start = new Date(`${String(medicine.start_date).slice(0, 10)}T00:00:00Z`);
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = Math.floor((date - start) / 86400_000);
  const taking = Math.max(1, Number(medicine.cycle_days) || 1);
  const resting = Math.max(0, Number(medicine.break_days) || 0);
  return day >= 0 && day % (taking + resting) < taking;
}

/** Ensure every active dose for a Vietnam calendar day exists before it is due. */
export async function ensureRemindersForDate(dateKey) {
  const medicines = await getActiveMedicinesForDate(dateKey);
  const created = [];
  for (const medicine of medicines) {
    if (!isMedicineOnCycle(medicine, dateKey)) continue;
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
    if (!isMedicineOnCycle(medicine, dateKey)) continue;
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
export async function getReminders(filters = {}, userId) {
  if (!filters.all) {
    await ensureRemindersForDate(vietnamDateParts().dateKey);
  }
  let query = `
    SELECT
      r.*,
      m.name AS medicine_name,
      m.dosage,
      m.unit,
      m.user_id
    FROM reminders r
    JOIN medicines m
      ON m.id = r.medicine_id
    WHERE m.user_id = ?
  `;

  const params = [userId];

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
export async function markReminderTaken(reminderId, userId, { actualTakenAt, note } = {}) {
  const reminder = await db.prepare(`
    SELECT r.*, m.stock_quantity, m.low_stock_threshold, m.dosage FROM reminders r JOIN medicines m ON m.id = r.medicine_id
    WHERE r.id = ? AND m.user_id = ?
  `).get(reminderId, userId);

  if (!reminder) {
    return null;
  }

  const customTime = actualTakenAt ? new Date(actualTakenAt) : null;
  if (customTime && Number.isNaN(customTime.getTime())) throw new Error('Thời điểm đã uống không hợp lệ.');
  const now = customTime ? customTime.toISOString() : new Date().toISOString();

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
    SET actual_taken_at = ?, status = 'taken', note = ?, skipped_reason = NULL
    WHERE id = (
      SELECT id FROM reminder_history
      WHERE medicine_id = ? AND scheduled_time = ?
      ORDER BY id DESC LIMIT 1
    )
  `).run(now, note || null, reminder.medicine_id, reminder.scheduled_time);

  if (reminder.stock_quantity != null) {
    const used = Number(reminder.dosage);
    const remaining = Math.max(0, Number(reminder.stock_quantity) - (Number.isFinite(used) && used > 0 ? used : 1));
    await db.prepare('UPDATE medicines SET stock_quantity = ?, shopping_needed = CASE WHEN low_stock_threshold IS NOT NULL AND ? <= low_stock_threshold THEN TRUE ELSE shopping_needed END WHERE id = ?').run(remaining, remaining, reminder.medicine_id);
  }

  return {
    id: reminderId,
    status: 'taken'
  };
}

export async function skipReminder(reminderId, userId, reason) {
  const reminder = await db.prepare('SELECT r.* FROM reminders r JOIN medicines m ON m.id = r.medicine_id WHERE r.id = ? AND m.user_id = ?').get(reminderId, userId);
  if (!reminder) return null;
  const now = new Date().toISOString();
  await db.prepare("UPDATE reminders SET status = 'skipped', updated_at = ? WHERE id = ?").run(now, reminderId);
  await db.prepare("UPDATE reminder_history SET status = 'skipped', skipped_reason = ?, note = NULL WHERE id = (SELECT id FROM reminder_history WHERE medicine_id = ? AND scheduled_time = ? ORDER BY id DESC LIMIT 1)").run(reason || 'Không nêu lý do', reminder.medicine_id, reminder.scheduled_time);
  return { id: reminderId, status: 'skipped' };
}

export async function undoReminder(reminderId, userId) {
  const reminder = await db.prepare('SELECT r.*, m.stock_quantity, m.dosage FROM reminders r JOIN medicines m ON m.id = r.medicine_id WHERE r.id = ? AND m.user_id = ?').get(reminderId, userId);
  if (!reminder) return null;
  if (reminder.status === 'taken' && reminder.stock_quantity != null) { const used = Number(reminder.dosage); await db.prepare('UPDATE medicines SET stock_quantity = stock_quantity + ? WHERE id = ?').run(Number.isFinite(used) && used > 0 ? used : 1, reminder.medicine_id); }
  const now = new Date().toISOString();
  await db.prepare("UPDATE reminders SET status = 'pending', actual_taken_at = NULL, updated_at = ? WHERE id = ?").run(now, reminderId);
  await db.prepare("UPDATE reminder_history SET status = 'pending', actual_taken_at = NULL, note = NULL, skipped_reason = NULL WHERE id = (SELECT id FROM reminder_history WHERE medicine_id = ? AND scheduled_time = ? ORDER BY id DESC LIMIT 1)").run(reminder.medicine_id, reminder.scheduled_time);
  return { id: reminderId, status: 'pending' };
}

/**
 * Snooze reminder for 10 minutes.
 */
export async function snoozeReminder(reminderId, userId) {
  const reminder = await db.prepare(`
    SELECT r.* FROM reminders r JOIN medicines m ON m.id = r.medicine_id
    WHERE r.id = ? AND m.user_id = ?
  `).get(reminderId, userId);

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
export async function getDueRemindersForNow(userId = null) {
  let query = `
    SELECT
      r.*,
      m.name AS medicine_name,
      m.dosage,
      m.unit,
      m.user_id
    FROM reminders r
    JOIN medicines m
      ON m.id = r.medicine_id
    WHERE r.status = 'pending'
      AND r.scheduled_time <= NOW()
  `;
  const params = [];
  if (userId != null) { query += ' AND m.user_id = ?'; params.push(userId); }
  query += ' ORDER BY r.scheduled_time ASC';
  return await db.prepare(query).all(...params);
}
