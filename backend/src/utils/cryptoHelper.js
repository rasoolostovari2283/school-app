const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('EDUCENC1', 'utf8'); // 8-byte header for encrypted backups

function deriveKey(secretOverride = null) {
  const rawSecret =
    secretOverride ||
    process.env.BACKUP_ENCRYPTION_KEY ||
    process.env.PII_ENCRYPTION_KEY ||
    config.jwt?.secret ||
    'educonnect-default-key-fallback-32b';
  return crypto.createHash('sha256').update(String(rawSecret)).digest();
}

/**
 * Encrypts a Buffer using AES-256-GCM with an 8-byte magic header ('EDUCENC1'),
 * 12-byte IV, and 16-byte authentication tag.
 */
function encryptBuffer(plainBuffer, secretOverride = null) {
  if (!Buffer.isBuffer(plainBuffer)) {
    plainBuffer = Buffer.from(plainBuffer);
  }
  const key = deriveKey(secretOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC_HEADER, iv, authTag, encrypted]);
}

/**
 * Decrypts a Buffer previously encrypted by `encryptBuffer`.
 * If the buffer does not start with 'EDUCENC1', returns it unchanged (backward compatible).
 */
function decryptBuffer(inputBuffer, secretOverride = null) {
  if (!Buffer.isBuffer(inputBuffer)) {
    inputBuffer = Buffer.from(inputBuffer);
  }
  if (inputBuffer.length < MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH) {
    return inputBuffer;
  }
  const header = inputBuffer.subarray(0, MAGIC_HEADER.length);
  if (!header.equals(MAGIC_HEADER)) {
    return inputBuffer;
  }
  const key = deriveKey(secretOverride);
  const iv = inputBuffer.subarray(MAGIC_HEADER.length, MAGIC_HEADER.length + IV_LENGTH);
  const authTag = inputBuffer.subarray(
    MAGIC_HEADER.length + IV_LENGTH,
    MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = inputBuffer.subarray(MAGIC_HEADER.length + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Field-level PII encryption (AES-256-GCM, prefixed with `enc:v1:`).
 */
function encryptPII(plaintext, secretOverride = null) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  const str = String(plaintext);
  if (str.startsWith('enc:v1:')) return str;
  const key = deriveKey(secretOverride || process.env.PII_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Field-level PII decryption (transparently returns plaintext if not prefixed with `enc:v1:`).
 */
function decryptPII(value, secretOverride = null) {
  if (value === null || value === undefined || typeof value !== 'string') return value;
  if (!value.startsWith('enc:v1:')) return value;
  try {
    const parts = value.split(':');
    if (parts.length !== 5) return value;
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const ciphertext = Buffer.from(parts[4], 'hex');
    const key = deriveKey(secretOverride || process.env.PII_ENCRYPTION_KEY);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (_err) {
    return value;
  }
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  encryptPII,
  decryptPII,
  MAGIC_HEADER,
};
