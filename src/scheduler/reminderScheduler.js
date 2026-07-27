import { generateRemindersForNow } from '../services/reminderService.js';
import { getDb } from '../database/db.js';
import { sendTelegramMessage } from '../services/telegramService.js';

const db = getDb();

/**
 * Poll every minute and create reminders when due.
 */
export function startScheduler() {
  setInterval(async () => {
    try {
      const reminders = await generateRemindersForNow();

      if (!reminders.length) {
        return;
      }

      const reminder = reminders[0];

      await db.prepare(`
        INSERT INTO reminder_history (
          medicine_id,
          medicine_name,
          scheduled_time,
          actual_taken_at,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(
        reminder.medicineId,
        reminder.medicineName,
        reminder.scheduledTime,
        null,
        new Date().toISOString()
      );

      const message = `⏰ Đã đến giờ uống thuốc

${reminder.medicineName}
Liều: ${reminder.dosage || '1'} ${reminder.unit || 'viên'}
Thời gian: ${reminder.scheduledTime}`;

      await sendTelegramMessage(message);

    } catch (error) {
      console.error('Scheduler error:', error);
    }
  }, 60 * 1000);
}