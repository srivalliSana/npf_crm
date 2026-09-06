// Secrets-at-rest (item 29 — encryption).
//
// Lifted verbatim out of index.js so the integration registry stores connector
// credentials with exactly the same scheme as integration_settings, rather than
// growing a second, subtly different one.
//
// Opt-in via the SETTINGS_ENC_KEY env var. Backward-compatible in both
// directions: without a key nothing is encrypted (unchanged behaviour), and
// legacy plaintext values still read fine once a key is added.
import crypto from 'crypto'

export const SETTINGS_MASK = '••••••'

export const isSecretKey = (k) =>
  /(pass|secret|token|api_key|access_key|salt|hash)/i.test(k) || /_key$/i.test(k)

const _encKey = process.env.SETTINGS_ENC_KEY
  ? crypto.scryptSync(process.env.SETTINGS_ENC_KEY, 'ccrm-settings', 32)
  : null

export const encryptionEnabled = () => !!_encKey

export function encryptSecret(plain) {
  if (!_encKey || plain == null || plain === '') return plain
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', _encKey, iv)
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

export function decryptSecret(stored) {
  if (!_encKey || typeof stored !== 'string' || !stored.startsWith('enc:v1:')) return stored
  try {
    const raw = Buffer.from(stored.slice(7), 'base64')
    const d = crypto.createDecipheriv('aes-256-gcm', _encKey, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch { return stored }
}
