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

export async function saveSubscription(subscription, userId) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Đăng ký thông báo không hợp lệ.');
  }
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO push_subscriptions (endpoint, subscription_json, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = EXCLUDED.subscription_json, user_id = EXCLUDED.user_id, updated_at = EXCLUDED.updated_at
  `).run(subscription.endpoint, JSON.stringify(subscription), userId, now, now);
}

/** Send a background notification for one reminder. It is safe to call repeatedly. */
export async function sendReminderPush(reminder) {
  const scheduledTimeVN = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(reminder.scheduled_time));
  if (!configureWebPush()) return { sent: false, reason: 'not-configured' };

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(reminder.scheduled_time).getTime()) / 60_000));
  const wantedStage = elapsedMinutes >= 30 ? 'late' : elapsedMinutes >= 10 ? 'follow_up' : 'due';
  const candidates = wantedStage === 'late' ? ['due', 'follow_up', 'late'] : wantedStage === 'follow_up' ? ['due', 'follow_up'] : ['due'];
  const sentStages = new Set((await db.prepare('SELECT stage FROM reminder_notification_events WHERE reminder_id = ?').all(reminder.id)).map((row) => row.stage));
  const stage = candidates.find((candidate) => !sentStages.has(candidate));
  if (!stage) return { sent: false, reason: 'already-sent' };
  const claim = await db.prepare(`INSERT INTO reminder_notification_events (reminder_id, stage, sent_at) VALUES (?, ?, ?) ON CONFLICT(reminder_id, stage) DO NOTHING RETURNING reminder_id`).get(reminder.id, stage, new Date().toISOString());
  if (!claim) return { sent: false, reason: 'already-sent' };

  const subscriptions = await db.prepare('SELECT id, endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?').all(reminder.user_id);
  // The live scheduler returns camelCase values; the cron query returns
  // database-style snake_case values. Normalize before building the payload.
  reminder.medicine_name ??= reminder.medicineName;
  reminder.scheduled_time ??= reminder.scheduledTime;

  let payload = JSON.stringify({
    title: 'Nhắc uống thuốc',
    body: `💊 ${reminder.medicine_name} · ${reminder.dosage || '1'} ${reminder.unit || 'viên'} · ${scheduledTimeVN}`,
    url: '/',
    reminderId: reminder.id,
    actions: [
      { action: 'taken', title: '✅ Đã uống' },
      { action: 'snooze', title: '⏰ Nhắc lại 10p' }
    ]
  });

  if (stage !== 'due') {
    payload = JSON.stringify({
      title: stage === 'late' ? 'Liều thuốc đã trễ' : 'Nhắc lại uống thuốc',
      body: stage === 'late'
        ? `⚠️ Liều trễ: ${reminder.medicine_name}. Hãy xác nhận đã uống hoặc bỏ qua liều này.`
        : `⏰ Nhắc lại: ${reminder.medicine_name} vẫn chưa được xác nhận.`,
      url: '/',
      reminderId: reminder.id,      // 👈 thêm luôn để nút vẫn hiện ở follow_up/late
      actions: [
        { action: 'taken', title: '✅ Đã uống' },
        { action: 'snooze', title: '⏰ Nhắc lại 10p' }
      ]
    });
  }
  let delivered = 0;
  const failures = [];
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), payload);
      delivered += 1;
    } catch (error) {
      failures.push(error.message);
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      } else {
        console.error('Web Push delivery failed:', error.message);
      }
    }
  }));

  // Do not permanently suppress this reminder when there were no active
  // subscriptions (or delivery failed). The next cron run can retry it.
  if (!delivered) {
    await db.prepare('DELETE FROM reminder_notification_events WHERE reminder_id = ? AND stage = ?').run(reminder.id, stage);
  }

  return {
    sent: delivered > 0,
    delivered,
    subscriptions: subscriptions.length,
    reason: delivered ? undefined : (subscriptions.length ? 'delivery-failed' : 'no-subscription'),
    failure: failures[0]
  };
}

/** Notify only the owner when a medicine reaches its configured low-stock threshold. */
export async function sendLowStockPush(medicine) {
  if (!configureWebPush()) return { sent: false, reason: 'not-configured' };
  const subscriptions = await db.prepare('SELECT id, subscription_json FROM push_subscriptions WHERE user_id = ?').all(medicine.user_id);
  const payload = JSON.stringify({ title: 'Sắp hết thuốc', body: `🛒 ${medicine.name} còn ${medicine.stock_quantity} ${medicine.unit || 'đơn vị'}. Hãy thêm vào danh sách cần mua.`, url: '/?view=shopping' });
  let delivered = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try { await webpush.sendNotification(JSON.parse(row.subscription_json), payload); delivered += 1; }
    catch (error) { if (error.statusCode === 404 || error.statusCode === 410) await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id); }
  }));
  return { sent: delivered > 0, delivered, subscriptions: subscriptions.length };
}

/** Send a user-triggered diagnostic notification without changing reminder state. */
export async function sendTestPush(userId) {
  if (!configureWebPush()) return { sent: false, reason: 'not-configured', delivered: 0 };

  const subscriptions = await db.prepare('SELECT id, subscription_json FROM push_subscriptions WHERE user_id = ?').all(userId);
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
