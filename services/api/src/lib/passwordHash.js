/**
 * services/api/src/lib/passwordHash.js
 * Salted scrypt hashing for security-question answers (Node's built-in
 * crypto — no native dependency to compile). Answers are normalized
 * (trimmed + lowercased) so recall isn't broken by casing or stray spaces.
 */
const crypto = require('crypto');

function normalize(answer) {
  return String(answer).trim().toLowerCase();
}

function hashAnswer(answer) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(normalize(answer), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyAnswer(answer, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(normalize(answer), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return check.length === expected.length && crypto.timingSafeEqual(check, expected);
}

module.exports = { hashAnswer, verifyAnswer };
