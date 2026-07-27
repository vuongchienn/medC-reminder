import { getDb } from './database/db.js';

const db = getDb();

/**
 * Seed the database with a few starter medicines and schedules.
 */
export function seedSampleData() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM medicines').get();
  if (existing.count > 0) return;

  const medicineStmt = db.prepare(`
    INSERT INTO medicines (name, description, dosage, unit, notes, start_date, end_date, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const scheduleStmt = db.prepare(`
    INSERT INTO medicine_schedules (medicine_id, time_of_day, enabled)
    VALUES (?, ?, ?)
  `);

  const now = new Date().toISOString();
  const medicineId = medicineStmt.run('Paracetamol', 'Pain relief', '1', 'viên', 'Take after meals', '2026-01-01', null, 1, now, now).lastInsertRowid;
  scheduleStmt.run(medicineId, '08:00', 1);
  scheduleStmt.run(medicineId, '12:00', 1);
  scheduleStmt.run(medicineId, '18:00', 1);
  scheduleStmt.run(medicineId, '22:00', 1);

  const medicineId2 = medicineStmt.run('Amoxicillin', 'Antibiotic', '1', 'gói', 'Complete the course', '2026-01-01', null, 1, now, now).lastInsertRowid;
  scheduleStmt.run(medicineId2, '09:00', 1);
  scheduleStmt.run(medicineId2, '21:00', 1);

  db.prepare(`
    INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
    VALUES (?, ?, ?, ?, 'taken', ?)
  `).run(medicineId, 'Paracetamol', '2026-01-01T08:00', now, now);
  db.prepare(`
    INSERT INTO reminder_history (medicine_id, medicine_name, scheduled_time, actual_taken_at, status, created_at)
    VALUES (?, ?, ?, ?, 'missed', ?)
  `).run(medicineId2, 'Amoxicillin', '2026-01-01T09:00', null, now);
}
