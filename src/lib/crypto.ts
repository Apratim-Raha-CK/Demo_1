import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-cbc'
const KEY_SOURCE = process.env.ENCRYPTION_KEY || 'gcp_demo_app_secret_encryption_key_32bytes_long'
const SECRET_KEY = crypto.createHash('sha256').update(KEY_SOURCE).digest() // guarantee 32 bytes

/**
 * Encrypts plain text using AES-256-CBC.
 * Returns IV and cipher text joined by a colon.
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a formatted ciphertext (iv:ciphertext) back to plain text.
 */
export function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted password format')
  }
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
