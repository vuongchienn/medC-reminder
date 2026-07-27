import { getDueRemindersForNow } from '../services/reminderService.js';
import { sendTelegramMessage } from '../services/telegramService.js';
import { sendReminderPush } from '../services/pushService.js';

/**
 * Poll due doses every minute. The calendar may have created the dose ahead
 * of time, so creating a reminder is not used as the notification trigger.
 */
export function startScheduler() {
  const run = async () => {
    try {
      const reminders = await getDueRemindersForNow();

      console.log(`Reminder scheduler: ${reminders.length} pending due reminder(s).`);

      if (!reminders.length) {
        return;
      }

      const reminder = reminders[0];
      // Kept for the existing Telegram message template below.
      reminder.medicineName = reminder.medicine_name;
      reminder.scheduledTime = reminder.scheduled_time;

      // Push is sent by the server because an installed iPhone PWA may be
      // closed when the medicine is due.
      const results = await Promise.all(reminders.map((dueReminder) => sendReminderPush(dueReminder)));
      console.log('Reminder push results:', results);

      const message = `⏰ Đã đến giờ uống thuốc

${reminder.medicineName}
Liều: ${reminder.dosage || '1'} ${reminder.unit || 'viên'}
Thời gian: ${reminder.scheduledTime}`;

      await sendTelegramMessage(message);

    } catch (error) {
      console.error('Scheduler error:', error);
    }
  };

  run();
  setInterval(run, 60 * 1000);
}
