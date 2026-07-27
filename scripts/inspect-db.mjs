import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

try {
  const result = await pool.query(`
    SELECT CURRENT_TIMESTAMP AS server_now, CURRENT_SETTING('TimeZone') AS timezone,
      id, scheduled_time, status
    FROM reminders
    WHERE status = 'pending'
    ORDER BY scheduled_time
  `);
  console.log(JSON.stringify(result.rows));
} finally {
  await pool.end();
}
