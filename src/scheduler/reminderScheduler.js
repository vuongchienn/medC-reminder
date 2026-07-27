import { generateRemindersForNow } from '../services/reminderService.js';
import { getDb } from '../database/db.js';
import { sendTelegramMessage } from '../services/telegramService.js';

const db = getDb();

/**
 * Poll every minute and create reminders when due.
 */
export function startScheduler() {
  setInterval(() => {
    const reminders = generateRemindersForNow();
    if (reminders.length) {
      const reminder = reminders[0];
      db.prepare(`
        INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(reminder.medicineId, reminder.medicineName, reminder.scheduledTime, null, new Date().toISOString());

      const message = `⏰ Đã đến giờ uống thuốc\n\n${reminder.medicineName}\nLiều: ${reminder.dosage || '1'} ${reminder.unit || 'viên'}\nThời gian: ${reminder.scheduledTime}`;
      sendTelegramMessage(message).catch(() => {});
    }
  }, 60 * 1000);
}
