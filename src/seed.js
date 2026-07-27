import { getDb } from './database/db.js';

const db = getDb();

/**
 * Seed sample data for PostgreSQL
 */
export async function seedSampleData() {
  const existing = await db.prepare(
    'SELECT COUNT(*) AS count FROM medicines'
  ).get();

  if (Number(existing.count) > 0) {
    return;
  }

  const medicineStmt = db.prepare(`
    INSERT INTO medicines (
      name,
      description,
      dosage,
      unit,
      notes,
      start_date,
      end_date,
      active,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `);

  const scheduleStmt = db.prepare(`
    INSERT INTO medicine_schedules (
      medicine_id,
      time_of_day,
      enabled
    )
    VALUES (?, ?, ?)
  `);

  const historyStmt = db.prepare(`
    INSERT INTO reminder_history (
      medicine_id,
      medicine_name,
      scheduled_time,
      actual_taken_at,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  // Paracetamol
  const medicine1 = await medicineStmt.get(
    'Paracetamol',
    'Pain relief',
    '1',
    'viên',
    'Take after meals',
    '2026-01-01',
    null,
    true,
    now,
    now
  );

  const medicineId1 = medicine1.id;

  await scheduleStmt.run(medicineId1, '08:00', true);
  await scheduleStmt.run(medicineId1, '12:00', true);
  await scheduleStmt.run(medicineId1, '18:00', true);
  await scheduleStmt.run(medicineId1, '22:00', true);

  // Amoxicillin
  const medicine2 = await medicineStmt.get(
    'Amoxicillin',
    'Antibiotic',
    '1',
    'gói',
    'Complete the course',
    '2026-01-01',
    null,
    true,
    now,
    now
  );

  const medicineId2 = medicine2.id;

  await scheduleStmt.run(medicineId2, '09:00', true);
  await scheduleStmt.run(medicineId2, '21:00', true);

  await historyStmt.run(
    medicineId1,
    'Paracetamol',
    '2026-01-01T08:00',
    now,
    'taken',
    now
  );

  await historyStmt.run(
    medicineId2,
    'Amoxicillin',
    '2026-01-01T09:00',
    null,
    'missed',
    now
  );
}