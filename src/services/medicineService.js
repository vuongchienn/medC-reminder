import { getDb } from '../database/db.js';

const db = getDb();

/**
 * Create a medicine and its schedules.
 */
export async function createMedicine(input, userId) {
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
      , user_id, cycle_days, break_days, stock_quantity, low_stock_threshold, shopping_needed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    input.active === false ? false : true,
    now,
    now,
    userId,
    Math.max(1, Number(input.cycleDays) || 1),
    Math.max(0, Number(input.breakDays) || 0),
    input.stockQuantity === '' || input.stockQuantity == null ? null : Number(input.stockQuantity),
    input.lowStockThreshold === '' || input.lowStockThreshold == null ? null : Number(input.lowStockThreshold),
    Boolean(input.shoppingNeeded)
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

  return await getMedicineById(medicineId, userId);
}

/**
 * Get all medicines with schedules.
 */
export async function getMedicines(filters = {}, userId) {
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
  query += ' AND m.user_id = ?';
  params.push(userId);

  if (filters.search) {
    query += ` AND m.name ILIKE ?`;
    params.push(`%${filters.search}%`);
  }

  if (filters.status === 'active') {
query += ' AND m.active = TRUE';
}

    if (filters.status === 'paused') {
    query += ' AND m.active = FALSE';
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
export async function getMedicineById(id, userId) {
  const row = await db.prepare(`
    SELECT
      m.*,
      STRING_AGG(s.time_of_day, '|') AS schedule_times
    FROM medicines m
    LEFT JOIN medicine_schedules s
      ON s.medicine_id = m.id
    WHERE m.id = ? AND m.user_id = ?
    GROUP BY m.id
  `).get(id, userId);

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
export async function updateMedicine(id, input, userId) {
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
      cycle_days = ?,
      break_days = ?,
      stock_quantity = ?,
      low_stock_threshold = ?,
      shopping_needed = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    input.name,
    input.description || '',
    input.dosage || '',
    input.unit || 'viên',
    input.notes || '',
    input.startDate || null,
    input.endDate || null,
    input.active === false ? false : true,
    Math.max(1, Number(input.cycleDays) || 1),
    Math.max(0, Number(input.breakDays) || 0),
    input.stockQuantity === '' || input.stockQuantity == null ? null : Number(input.stockQuantity),
    input.lowStockThreshold === '' || input.lowStockThreshold == null ? null : Number(input.lowStockThreshold),
    Boolean(input.shoppingNeeded),
    now,
    id,
    userId
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

  return await getMedicineById(id, userId);
}

/**
 * Delete medicine.
 */
export async function deleteMedicine(id, userId) {
  const result = await db.prepare(`
    DELETE FROM medicines
    WHERE id = ? AND user_id = ?
  `).run(id, userId);

  return (result.changes || 0) > 0;
}
