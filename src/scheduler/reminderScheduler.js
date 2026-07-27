import { generateRemindersForNow } from '../services/reminderService.js';
import { sendTelegramMessage } from '../services/telegramService.js';

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
