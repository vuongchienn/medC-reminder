import express from 'express';
import { createMedicine, getMedicines, getMedicineById, updateMedicine, deleteMedicine } from '../services/medicineService.js';
import { getReminders, markReminderTaken, snoozeReminder } from '../services/reminderService.js';
import { calculateStats } from '../services/statsService.js';
import { exportHistoryCsv, exportHistoryJson, exportBackup } from '../services/exportService.js';
import { getDb } from '../database/db.js';

const router = express.Router();
const db = getDb();

router.get('/api/medicines', (req, res) => {
  res.json(getMedicines(req.query));
});

router.post('/api/medicines', (req, res) => {
  res.json(createMedicine(req.body));
});

router.get('/api/medicines/:id', (req, res) => {
  const medicine = getMedicineById(Number(req.params.id));
  if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
  res.json(medicine);
});

router.put('/api/medicines/:id', (req, res) => {
  res.json(updateMedicine(Number(req.params.id), req.body));
});

router.delete('/api/medicines/:id', (req, res) => {
  const deleted = deleteMedicine(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Medicine not found' });
  res.json({ success: true });
});

router.get('/api/reminders', (req, res) => {
  res.json(getReminders(req.query));
});

router.post('/api/reminders/:id/taken', (req, res) => {
  const result = markReminderTaken(Number(req.params.id));
  if (!result) return res.status(404).json({ error: 'Reminder not found' });
  res.json(result);
});

router.post('/api/reminders/:id/snooze', (req, res) => {
  const result = snoozeReminder(Number(req.params.id));
  if (!result) return res.status(404).json({ error: 'Reminder not found' });
  res.json(result);
});

router.get('/api/stats', (req, res) => {
  const history = db.prepare(`
    SELECT medicine_name, status
    FROM reminder_history
    ORDER BY created_at DESC
  `).all();
  res.json(calculateStats(history));
});

router.get('/api/export/csv', (req, res) => {
  res.type('text/csv').send(exportHistoryCsv());
});

router.get('/api/export/json', (req, res) => {
  res.type('application/json').send(exportHistoryJson());
});

router.get('/api/backup', (req, res) => {
  res.type('application/json').send(exportBackup());
});

router.get('/api/settings', (req, res) => {
  const value = db.prepare('SELECT value FROM settings WHERE key = ?').get('dark_mode')?.value ?? 'false';
  res.json({ darkMode: value === 'true' });
});

router.post('/api/settings', (req, res) => {
  const darkMode = Boolean(req.body.darkMode);
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('dark_mode', String(darkMode));
  res.json({ darkMode });
});

export default router;
