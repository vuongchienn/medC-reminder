import { getDueRemindersForNow, ensureRemindersForDate, vietnamDateParts } from '../services/reminderService.js';
import { sendReminderPush } from '../services/pushService.js';

/**
 * Poll due doses every minute. The calendar may have created the dose ahead
 * of time, so creating a reminder is not used as the notification trigger.
 */

export function startScheduler() {
  const run = async () => {
    try {
      const { dateKey } = vietnamDateParts();
      await ensureRemindersForDate(dateKey);

      const reminders = await getDueRemindersForNow();
      if (!reminders.length) return;

      const results = await Promise.all(reminders.map((r) => sendReminderPush(r)));
      console.log('Reminder push results:', results);
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  };

  run();
  setInterval(run, 60 * 1000);
}

function formatVietnamTime(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(date));
}
