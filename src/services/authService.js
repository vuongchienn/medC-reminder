import crypto from 'crypto';
import { getDb } from '../database/db.js';

const db = getDb();
const SESSION_DAYS = 30;
const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`));
});
const verifyPassword = async (password, stored) => {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = (await passwordHash(password, salt)).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
};

function publicUser(user) { return { id: user.id, email: user.email, displayName: user.display_name }; }

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').run(userId, hashToken(token), expires, new Date().toISOString());
  return { token, expires };
}

export async function signUp({ email, password, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Email không hợp lệ.');
  if (String(password || '').length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
  const count = await db.prepare('SELECT COUNT(*)::int AS count FROM users').get();
  const user = await db.prepare('INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?) RETURNING id, email, display_name').get(normalizedEmail, String(displayName || '').trim() || normalizedEmail.split('@')[0], await passwordHash(password));
  // Preserve existing single-user data during the first upgrade to accounts.
  if (Number(count?.count || 0) === 0) await db.prepare('UPDATE medicines SET user_id = ? WHERE user_id IS NULL').run(user.id);
  return { user: publicUser(user), session: await createSession(user.id) };
}

export async function signIn({ email, password }) {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !(await verifyPassword(String(password || ''), user.password_hash))) throw new Error('Email hoặc mật khẩu không đúng.');
  return { user: publicUser(user), session: await createSession(user.id) };
}

export async function getSessionUser(token) {
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.email, u.display_name FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW()`).get(hashToken(token));
}

export async function signOut(token) { if (token) await db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashToken(token)); }
export const sessionCookie = { name: 'medreminder_session', maxAge: SESSION_DAYS * 86400_000 };
