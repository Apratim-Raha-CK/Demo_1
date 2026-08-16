import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'gcp_demo_app_jwt_secret_key'

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string
    role: string
    permissions: string[]
  }
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1]
  console.log("MIDDLEWARE HIT",token)

  if (!token) {
    res.status(401).json({ status: 'failure', message: 'Access token missing or unauthorized access' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string; role: string; permissions: string[] }
    req.user = decoded
    next()
  } catch (error) {
    res.status(403).json({ status: 'failure', message: 'Invalid or expired token' })
  }
}

export function checkFolderPermission(userPermissions: string[] = [], userRole: string = '', folderName: string = ''): boolean {
  if (userRole.toLowerCase() === 'admin') {
    return true
  }
  // Check if they have general creation permission or folder-specific creation/upload permission
  const lowerFolder = folderName.toLowerCase()
  return (
    userPermissions.includes('file/create') ||
    userPermissions.includes(`${lowerFolder}/create`) ||
    userPermissions.includes(`upload:${lowerFolder}`) ||
    userPermissions.includes(`${folderName}/create`) ||
    userPermissions.includes(`upload:${folderName}`)
  )
}
