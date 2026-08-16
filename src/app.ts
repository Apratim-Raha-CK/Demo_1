import express from 'express'
import cors from 'cors'
import multer from 'multer'
import type { Request, Response } from 'express'
import USERS from './lib/users.js'
import DB_FILES from './lib/dbfiles.js'
import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { encrypt, decrypt } from './lib/crypto.js'
import fs from 'node:fs'
import path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { authenticateToken, checkFolderPermission } from './lib/auth.js'
import type { AuthenticatedRequest } from './lib/auth.js'

const app = express()
const port = Number(process.env.PORT) || 8080

const gcsStorage = new Storage()
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'bucket_for_gcp_app_ar'

const DUP_DB_FILES = DB_FILES.map((file, index) => {
  let project = 'general';
  if (index < 2) project = 'project1';
  else if (index < 4) project = 'project2';
  return {
    ...file,
    project: project
  };
});
const DUP_USERS = [...USERS]

const JWT_SECRET = process.env.JWT_SECRET || 'gcp_demo_app_jwt_secret_key'

// Encrypt existing user passwords on startup if they aren't already encrypted
for (const user of DUP_USERS) {
  if (!user.password.includes(':')) {
    user.password = encrypt(user.password)
  }
}

const FRONTEND_CR_INSTANCE= process.env.FRONTEND_CR_INSTANCE || "https://frontend-instance-for-demo-800143476860.asia-south1.run.app"
const FRONTEND_APP_LB= process.env.FRONTEND_APP_LB || "http://136.69.118.80"

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173', 
  'https://136.69.118.80',
  FRONTEND_CR_INSTANCE,
  FRONTEND_APP_LB
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(null,false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Set-Cookie']
  })
)

app.use(express.json())
app.use(cookieParser())

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './tmp/my-uploads')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + '-' + uniqueSuffix)
  }
})

const upload = multer({ storage })

app.get('/api/', (req: Request, res: Response) => {
  res.json({ message: 'Hello world' })
})

app.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body
  try {
    const user = DUP_USERS.find((user) => user.username.toLowerCase() === username?.trim().toLowerCase())
    if (!user) {
      throw new Error('Invalid credentials')
    }

    const decryptedPassword = decrypt(user.password)
    if (decryptedPassword !== password) {
      throw new Error('Invalid credentials')
    }

    const tokenPayload = {
      username: user.username,
      role: user.role,
      permissions: user.permissions
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' })

    // Set cookie with token
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000 // 1 hour
    })

    res.json({
      status: 'success',
      message: 'Login Successful ',
      token: token,
      data: {
        username: user.username,
        role: user.role,
        permissions: [...user.permissions]
      }
    })
  } catch (error: any) {
    res.status(401).json({ status: 'failure', message: error.message })
  }
})

app.get('/api/files', (req: Request, res: Response) => {
  try {
    const files = DUP_DB_FILES.map((file) => ({
      id: file.id,
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
      created_at: file.created_at,
      created_by: file.created_by,
      project: (file as any).project || 'general'
    }))

    res.status(200).json({
      status: 'success',
      message: 'Files fetched successfully',
      data: { files }
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.get('/api/users', (req: Request, res: Response) => {
  try {
    res.status(200).json({
      status: 'success',
      message: 'Users fetched successfully',
      data: { users: DUP_USERS }
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.post('/api/create-user', (req: Request, res: Response) => {
  try {
    const { username, password, role, permissions } = req.body
    if (!username || !password || !role) {
      res.status(400).json({ status: 'failure', message: 'Username, password, and role are required' })
      return
    }

    const trimmedUsername = username.trim()
    const userExists = DUP_USERS.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase())
    if (userExists) {
      res.status(400).json({ status: 'failure', message: 'User already exists' })
      return
    }

    const newUser = {
      userid: Math.floor(1000 + Math.random() * 9000),
      username: trimmedUsername,
      password: encrypt(password),
      role: role,
      permissions: Array.isArray(permissions) ? permissions : []
    }

    DUP_USERS.push(newUser)

    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      data: { user: newUser }
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.put('/api/users/:userid', (req: Request, res: Response) => {
  try {
    const { userid } = req.params
    const { role, permissions } = req.body

    if (!role) {
      res.status(400).json({ status: 'failure', message: 'Role is required' })
      return
    }

    const user = DUP_USERS.find(u => u.userid === Number(userid))
    if (!user) {
      res.status(404).json({ status: 'failure', message: 'User not found' })
      return
    }

    user.role = role
    if (Array.isArray(permissions)) {
      user.permissions = permissions
    }

    res.status(200).json({
      status: 'success',
      message: 'User updated successfully',
      data: { user }
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.post('/api/upload-file', upload.single('uploaded_file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file.' })
  }

  const newFileEntry = {
    file_name: req.file.originalname,
    unique_name: req.file.filename,
    file_path: req.file.path,
    file_type: req.file.mimetype,
    file_size: req.file.size,
    created_at: new Date(),
    created_by: 'Admin'
  }

  const project = req.body.project || 'general'

  if (req?.cookies?.user_data) {
    try {
      const userData = JSON.parse(req.cookies.user_data)
      newFileEntry.created_by = userData?.username ?? 'Admin'
    } catch {
      newFileEntry.created_by = 'Admin'
    }
  }

  DUP_DB_FILES.push({
    id: newFileEntry.unique_name,
    file_name: newFileEntry.file_name,
    file_type: newFileEntry.file_type,
    file_size: newFileEntry.file_size,
    created_at: newFileEntry.created_at,
    created_by: newFileEntry.created_by,
    project: project
  })

  res.status(201).json({
    status: 'success',
    message: 'File uploaded successfully!',
    data: newFileEntry
  })
})

app.post('/api/generate-upload-url', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileName, contentType, project = 'general' } = req.body
    if (!fileName) {
      res.status(400).json({ status: 'failure', message: 'fileName is required' })
      return
    }

    const hasPermission = checkFolderPermission(req.user?.permissions, req.user?.role, project)
    if (!hasPermission) {
      res.status(403).json({ status: 'failure', message: `You do not have permission to upload to ${project}` })
      return
    }

    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${fileName}`
    const gcsPath = `${project}/${uniqueName}`

    try {
      // let clientEmail: string | undefined
      // try {
      //   const isMetadataAvailable = await gcpMetadata.isAvailable()
      //   if (isMetadataAvailable) {
      //     clientEmail = await gcpMetadata.instance('service-accounts/default/email')
      //   }
      // } catch (metadataError: any) {
      //   console.warn('Failed to retrieve service account email from metadata server:', metadataError.message)
      // }

      // const storageToUse = clientEmail
      //   ? new Storage({ credentials: { client_email: clientEmail } })
      //   : gcsStorage

      console.log("UPTO HERE")

      const gcsFile = gcsStorage.bucket(BUCKET_NAME).file(gcsPath)
      
      const [url] = await gcsFile.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType || 'application/octet-stream'
      })

      console.log("URL",url)

      res.status(200).json({
        status: 'success',
        message: 'Signed URL generated successfully',
        data: {
          uploadUrl: url,
          uniqueName,
          project,
          fileName,
          isFallback: false
        }
      })
    } catch (gcsError: any) {
      // Local fallback for development environment when running as user credentials
      console.warn('GCS Signed URL generation failed, falling back to local simulation:', gcsError.message)
      
      // Determine protocol and host based on request headers
      const host = req.get('host') || `localhost:${port}`
      const protocol = req.protocol || 'http'
      const fallbackUrl = `${protocol}://${host}/local-upload-fallback?uniqueName=${encodeURIComponent(uniqueName)}&project=${encodeURIComponent(project)}&fileName=${encodeURIComponent(fileName)}`

      res.status(200).json({
        status: 'success',
        message: 'GCS Signed URL generation failed; using local fallback for development',
        data: {
          uploadUrl: fallbackUrl,
          uniqueName,
          project,
          fileName,
          isFallback: true
        }
      })
    }
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.put('/api/local-upload-fallback', (req: Request, res: Response) => {
  try {
    const { uniqueName } = req.query
    if (!uniqueName || typeof uniqueName !== 'string') {
      res.status(400).json({ status: 'failure', message: 'uniqueName is required' })
      return
    }

    const dir = './tmp/my-uploads'
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const filePath = path.join(dir, uniqueName)
    const writeStream = fs.createWriteStream(filePath)
    
    req.pipe(writeStream)

    req.on('end', () => {
      res.status(200).json({ status: 'success', message: 'Local simulation upload successful' })
    })

    req.on('error', (err) => {
      res.status(500).json({ status: 'failure', message: err.message })
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.post('/api/register-file', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileName, uniqueName, project = 'general', fileType = 'unknown', fileSize = 0 } = req.body
    if (!fileName || !uniqueName) {
      res.status(400).json({ status: 'failure', message: 'fileName and uniqueName are required' })
      return
    }

    const hasPermission = checkFolderPermission(req.user?.permissions, req.user?.role, project)
    if (!hasPermission) {
      res.status(403).json({ status: 'failure', message: `You do not have permission to register files in ${project}` })
      return
    }

    const newFileEntry = {
      id: uniqueName,
      file_name: fileName,
      file_type: fileType,
      file_size: Number(fileSize),
      created_at: new Date(),
      created_by: req.user?.username || 'Admin',
      project: project
    }

    DUP_DB_FILES.push(newFileEntry)

    res.status(201).json({
      status: 'success',
      message: 'File registered successfully',
      data: newFileEntry
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.put('/api/files/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { file_name } = req.body
    if (!file_name) {
      res.status(400).json({ status: 'failure', message: 'New file name is required' })
      return
    }
    const file = DUP_DB_FILES.find(f => f.id === id)
    if (!file) {
      res.status(404).json({ status: 'failure', message: 'File not found' })
      return
    }
    file.file_name = file_name
    res.status(200).json({
      status: 'success',
      message: 'File renamed successfully',
      data: { file }
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.delete('/api/files/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const index = DUP_DB_FILES.findIndex(f => f.id === id)
    if (index === -1) {
      res.status(404).json({ status: 'failure', message: 'File not found' })
      return
    }
    DUP_DB_FILES.splice(index, 1)
    res.status(200).json({
      status: 'success',
      message: 'File deleted successfully'
    })
  } catch (error: any) {
    res.status(500).json({ status: 'failure', message: error.message })
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`)
})