import { generateRemindersForNow } from '../services/reminderService.js';
import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Poll every minute and create reminders when due.
 */
export function startScheduler() {
  setInterval(() => {
    const reminders = generateRemindersForNow();
    if (reminders.length) {
      db.prepare(`
        INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(reminders[0].medicineId, reminders[0].medicineName, reminders[0].scheduledTime, null, new Date().toISOString());
    }
  }, 60 * 1000);
}
