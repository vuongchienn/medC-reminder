import { generateRemindersForNow } from '../services/reminderService.js';
import { sendTelegramMessage } from '../services/telegramService.js';
import { sendReminderPush } from '../services/pushService.js';

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

      // Push is sent by the server because an installed iPhone PWA may be
      // closed when the medicine is due.
      await Promise.all(reminders.map((dueReminder) => sendReminderPush(dueReminder)));

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
