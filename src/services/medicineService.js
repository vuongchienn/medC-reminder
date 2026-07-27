import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Create a medicine and its schedules.
 */
export async function createMedicine(input) {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
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

  const inserted = await stmt.get(
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

  const medicineId = inserted.id;

  if (Array.isArray(input.schedules) && input.schedules.length) {
    const scheduleStmt = db.prepare(`
      INSERT INTO medicine_schedules (
        medicine_id,
        time_of_day,
        enabled
      )
      VALUES (?, ?, ?)
    `);

    for (const schedule of input.schedules) {
      await scheduleStmt.run(
        medicineId,
        schedule.timeOfDay,
        schedule.enabled === false ? false : true
      );
    }
  }

  return await getMedicineById(medicineId);
}

/**
 * Get all medicines with schedules.
 */
export async function getMedicines(filters = {}) {
  let query = `
    SELECT
      m.*,
      STRING_AGG(s.time_of_day, '|') AS schedule_times
    FROM medicines m
    LEFT JOIN medicine_schedules s
      ON s.medicine_id = m.id
    WHERE 1=1
  `;

  const params = [];

  if (filters.search) {
    query += ` AND m.name ILIKE ?`;
    params.push(`%${filters.search}%`);
  }

  if (filters.status) {
    query += ` AND m.active = ?`;
    params.push(filters.status === 'active');
  }

  query += `
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;

  const rows = await db.prepare(query).all(...params);

  return rows.map((row) => ({
    ...row,
    schedules: row.schedule_times
      ? row.schedule_times
          .split('|')
          .filter(Boolean)
          .map((time) => ({
            timeOfDay: time
          }))
      : []
  }));
}

/**
 * Get medicine by id.
 */
export async function getMedicineById(id) {
  const row = await db.prepare(`
    SELECT
      m.*,
      STRING_AGG(s.time_of_day, '|') AS schedule_times
    FROM medicines m
    LEFT JOIN medicine_schedules s
      ON s.medicine_id = m.id
    WHERE m.id = ?
    GROUP BY m.id
  `).get(id);

  if (!row) {
    return null;
  }

  return {
    ...row,
    schedules: row.schedule_times
      ? row.schedule_times
          .split('|')
          .filter(Boolean)
          .map((time) => ({
            timeOfDay: time
          }))
      : []
  };
}

/**
 * Update medicine.
 */
export async function updateMedicine(id, input) {
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE medicines
    SET
      name = ?,
      description = ?,
      dosage = ?,
      unit = ?,
      notes = ?,
      start_date = ?,
      end_date = ?,
      active = ?,
      updated_at = ?
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

  await db.prepare(`
    DELETE FROM medicine_schedules
    WHERE medicine_id = ?
  `).run(id);

  if (Array.isArray(input.schedules) && input.schedules.length) {
    const scheduleStmt = db.prepare(`
      INSERT INTO medicine_schedules (
        medicine_id,
        time_of_day,
        enabled
      )
      VALUES (?, ?, ?)
    `);

    for (const schedule of input.schedules) {
      await scheduleStmt.run(
        id,
        schedule.timeOfDay,
        schedule.enabled === false ? false : true
      );
    }
  }

  return await getMedicineById(id);
}

/**
 * Delete medicine.
 */
export async function deleteMedicine(id) {
  const result = await db.prepare(`
    DELETE FROM medicines
    WHERE id = ?
  `).run(id);

  return (result.changes || 0) > 0;
}