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