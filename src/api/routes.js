import express from 'express';
import {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  deleteMedicine
} from '../services/medicineService.js';

import {
  getReminders,
  markReminderTaken,
  snoozeReminder
} from '../services/reminderService.js';
import { getDueRemindersForNow } from '../services/reminderService.js';
import { getPublicKey, saveSubscription, sendReminderPush, sendTestPush } from '../services/pushService.js';

import { calculateStats } from '../services/statsService.js';
import {
  exportHistoryCsv,
  exportHistoryJson,
  exportBackup
} from '../services/exportService.js';

import { getDb } from '../database/db.js';

const router = express.Router();
const db = getDb();

router.get('/api/medicines', async (req, res) => {
  res.json(await getMedicines(req.query));
});

router.post('/api/medicines', async (req, res) => {
  res.json(await createMedicine(req.body));
});

router.get('/api/medicines/:id', async (req, res) => {
  const medicine = await getMedicineById(Number(req.params.id));

  if (!medicine) {
    return res.status(404).json({
      error: 'Medicine not found'
    });
  }

  res.json(medicine);
});

router.put('/api/medicines/:id', async (req, res) => {
  res.json(
    await updateMedicine(
      Number(req.params.id),
      req.body
    )
  );
});

router.delete('/api/medicines/:id', async (req, res) => {
  const deleted = await deleteMedicine(
    Number(req.params.id)
  );

  if (!deleted) {
    return res.status(404).json({
      error: 'Medicine not found'
    });
  }

  res.json({
    success: true
  });
});

router.get('/api/reminders', async (req, res) => {
  res.json(await getReminders(req.query));
});

router.post('/api/reminders/:id/taken', async (req, res) => {
  const result = await markReminderTaken(
    Number(req.params.id)
  );

  if (!result) {
    return res.status(404).json({
      error: 'Reminder not found'
    });
  }

  res.json(result);
});

router.post('/api/reminders/:id/snooze', async (req, res) => {
  const result = await snoozeReminder(
    Number(req.params.id)
  );

  if (!result) {
    return res.status(404).json({
      error: 'Reminder not found'
    });
  }

  res.json(result);
});

router.get('/api/push/public-key', (req, res) => {
  const publicKey = getPublicKey();
  if (!publicKey) return res.status(503).json({ error: 'Web Push chưa được cấu hình.' });
  res.json({ publicKey });
});

router.post('/api/push/subscribe', async (req, res) => {
  try {
    await saveSubscription(req.body);
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/push/test', async (req, res) => {
  try {
    const result = await sendTestPush();
    console.log('Push test result:', result);
    if (!result.sent) return res.status(503).json(result);
    res.json(result);
  } catch (error) {
    console.error('Push test failed:', error.message);
    res.status(500).json({ error: 'Unable to send test notification.' });
  }
});

// Manual recovery for pending doses that were marked sent by an older version
// before any device subscription was available.
router.post('/api/push/retry-due', async (req, res) => {
  try {
    const reminders = await getDueRemindersForNow();
    await Promise.all(reminders.map((reminder) => db.prepare(
      'DELETE FROM reminder_notifications WHERE reminder_id = ?'
    ).run(reminder.id)));
    const results = await Promise.all(reminders.map(sendReminderPush));
    console.log('Retry due push result:', results);
    res.json({ checked: reminders.length, delivered: results.reduce((total, item) => total + (item.delivered || 0), 0), results });
  } catch (error) {
    console.error('Retry due push failed:', error.message);
    res.status(500).json({ error: 'Unable to retry due notifications.' });
  }
});

// Called once per minute by a free external cron monitor. Keep the secret out of URLs shared publicly.
router.post('/api/jobs/process-reminders', async (req, res) => {
  if (!process.env.CRON_SECRET || req.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const reminders = await getDueRemindersForNow();
  const results = await Promise.all(reminders.map(sendReminderPush));
  res.json({
    checked: reminders.length,
    delivered: results.reduce((total, item) => total + (item.delivered || 0), 0),
    results
  });
});

router.get('/api/stats', async (req, res) => {
  const history = await db.prepare(`
    SELECT
      medicine_name,
      status,
      created_at,
      actual_taken_at,
      scheduled_time
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();

  res.json(calculateStats(history));
});

router.get('/api/export/csv', async (req, res) => {
  res.type('text/csv');
  res.send(await exportHistoryCsv());
});

router.get('/api/export/json', async (req, res) => {
  res.type('application/json');
  res.send(await exportHistoryJson());
});

router.get('/api/backup', async (req, res) => {
  res.type('application/json');
  res.send(await exportBackup());
});

router.get('/api/settings', async (req, res) => {
  const row = await db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
  `).get('dark_mode');

  res.json({
    darkMode: row?.value === 'true'
  });
});

router.post('/api/settings', async (req, res) => {
  const darkMode = Boolean(req.body.darkMode);

  await db.prepare(`
    INSERT INTO settings(key, value)
    VALUES(?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = EXCLUDED.value
  `).run(
    'dark_mode',
    String(darkMode)
  );

  res.json({
    darkMode
  });
});

export default router;
