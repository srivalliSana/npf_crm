// Shared JWT verification.
//
// Lifted out of index.js so the new route modules can guard themselves without
// importing the monolith (which would be a circular import), and so token
// revocation is enforced in exactly one place.
import jwt from 'jsonwebtoken'
import { isRevoked, touchSession } from './sessions.js'

export const JWT_SECRET = process.env.JWT_SECRET || 'ccrm-jwt-secret-key-2026'

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Access token missing.' })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' })
    // Tokens issued before sessions existed have no jti — they stay valid until
    // they expire (7 days), rather than logging the whole userbase out on deploy.
    if (user.jti && isRevoked(user.jti)) {
      return res.status(403).json({ error: 'Invalid or expired token.' })
    }
    req.user = user
    req.tenantId = user.tenant_id || 1   // multi-tenant scope
    if (user.jti) touchSession(user.jti)
    next()
  })
}
