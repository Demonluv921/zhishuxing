const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'zhishuxing-dev-secret';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
}

function signToken(uid) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, payload, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
