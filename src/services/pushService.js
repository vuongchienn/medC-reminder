import webpush from 'web-push';
import { getDb } from '../database/db.js';

const db = getDb();

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!configured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

export function getPublicKey() {
  return configured() ? process.env.VAPID_PUBLIC_KEY : null;
}

export async function saveSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Đăng ký thông báo không hợp lệ.');
  }
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO push_subscriptions (endpoint, subscription_json, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = EXCLUDED.subscription_json, updated_at = EXCLUDED.updated_at
  `).run(subscription.endpoint, JSON.stringify(subscription), now, now);
}

/** Send a background notification for one reminder. It is safe to call repeatedly. */
export async function sendReminderPush(reminder) {
  if (!configureWebPush()) return { sent: false, reason: 'not-configured' };

  const claim = await db.prepare(`
    INSERT INTO reminder_notifications (reminder_id, sent_at)
    VALUES (?, ?)
    ON CONFLICT(reminder_id) DO NOTHING
    RETURNING reminder_id
  `).get(reminder.id, new Date().toISOString());
  if (!claim) return { sent: false, reason: 'already-sent' };

  const subscriptions = await db.prepare('SELECT id, endpoint, subscription_json FROM push_subscriptions').all();
  // The live scheduler returns camelCase values; the cron query returns
  // database-style snake_case values. Normalize before building the payload.
  reminder.medicine_name ??= reminder.medicineName;
  reminder.scheduled_time ??= reminder.scheduledTime;

  const payload = JSON.stringify({
    title: 'Nhắc uống thuốc',
    body: `${reminder.medicine_name} · ${reminder.dosage || '1'} ${reminder.unit || 'viên'} · ${reminder.scheduled_time}`,
    url: '/'
  });

  let delivered = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), payload);
      delivered += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      } else {
        console.error('Web Push delivery failed:', error.message);
      }
    }
  }));

  return { sent: delivered > 0, delivered };
}

/** Send a user-triggered diagnostic notification without changing reminder state. */
export async function sendTestPush() {
  if (!configureWebPush()) return { sent: false, reason: 'not-configured', delivered: 0 };

  const subscriptions = await db.prepare('SELECT id, subscription_json FROM push_subscriptions').all();
  const payload = JSON.stringify({ title: 'MedReminder', body: 'Push test from server.', url: '/' });
  let delivered = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), payload);
      delivered += 1;
    } catch (error) {
      console.error('Web Push test delivery failed:', error.message);
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      }
    }
  }));
  return { sent: delivered > 0, delivered, subscriptions: subscriptions.length };
}
