import { getDb } from '../database/db.js';
import { Medicine } from '../models/medicine.js';

const db = getDb();

/**
 * Create a medicine and its schedules.
 * @param {object} input
 * @returns {Medicine}
 */
export function createMedicine(input) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO medicines (name, description, dosage, unit, notes, start_date, end_date, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    input.name,
    input.description || '',
    input.dosage || '',
    input.unit || 'viên',
    input.notes || '',
    input.startDate || now.split('T')[0],
    input.endDate || null,
    input.active === false ? 0 : 1,
    now,
    now
  );

  const medicineId = result.lastInsertRowid;
  if (Array.isArray(input.schedules) && input.schedules.length) {
    const scheduleStmt = db.prepare(`
      INSERT INTO medicine_schedules (medicine_id, time_of_day, enabled)
      VALUES (?, ?, ?)
    `);
    for (const schedule of input.schedules) {
      scheduleStmt.run(medicineId, schedule.timeOfDay, schedule.enabled === false ? 0 : 1);
    }
  }

  return getMedicineById(medicineId);
}

/**
 * Get all medicines with schedules.
 * @param {object} filters
 * @returns {Array<object>}
 */
export function getMedicines(filters = {}) {
  let query = `
    SELECT m.*, GROUP_CONCAT(s.time_of_day, '|') AS schedule_times
    FROM medicines m
    LEFT JOIN medicine_schedules s ON s.medicine_id = m.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.search) {
    query += ' AND m.name LIKE ?';
    params.push(`%${filters.search}%`);
  }

  if (filters.status) {
    query += ' AND m.active = ?';
    params.push(filters.status === 'active' ? 1 : 0);
  }

  query += ' GROUP BY m.id ORDER BY m.created_at DESC';
  const rows = db.prepare(query).all(...params);
  return rows.map((row) => ({
    ...row,
    schedules: row.schedule_times ? row.schedule_times.split('|').map((item) => ({ timeOfDay: item })) : []
  }));
}

/**
 * Get medicine by id with schedules.
 * @param {number} id
 * @returns {object|null}
 */
export function getMedicineById(id) {
  const row = db.prepare(`
    SELECT m.*, GROUP_CONCAT(s.time_of_day, '|') AS schedule_times
    FROM medicines m
    LEFT JOIN medicine_schedules s ON s.medicine_id = m.id
    WHERE m.id = ?
    GROUP BY m.id
  `).get(id);

  if (!row) return null;
  return {
    ...row,
    schedules: row.schedule_times ? row.schedule_times.split('|').map((item) => ({ timeOfDay: item })) : []
  };
}

/**
 * Update medicine and replace schedules.
 * @param {number} id
 * @param {object} input
 * @returns {object|null}
 */
export function updateMedicine(id, input) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE medicines
    SET name = ?, description = ?, dosage = ?, unit = ?, notes = ?, start_date = ?, end_date = ?, active = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name,
    input.description || '',
    input.dosage || '',
    input.unit || 'viên',
    input.notes || '',
    input.startDate || null,
    input.endDate || null,
    input.active === false ? 0 : 1,
    now,
    id
  );

  db.prepare('DELETE FROM medicine_schedules WHERE medicine_id = ?').run(id);
  if (Array.isArray(input.schedules) && input.schedules.length) {
    const scheduleStmt = db.prepare(`
      INSERT INTO medicine_schedules (medicine_id, time_of_day, enabled)
      VALUES (?, ?, ?)
    `);
    for (const schedule of input.schedules) {
      scheduleStmt.run(id, schedule.timeOfDay, schedule.enabled === false ? 0 : 1);
    }
  }

  return getMedicineById(id);
}

/**
 * Delete medicine and cascade children.
 * @param {number} id
 * @returns {boolean}
 */
export function deleteMedicine(id) {
  const result = db.prepare('DELETE FROM medicines WHERE id = ?').run(id);
  return result.changes > 0;
}
