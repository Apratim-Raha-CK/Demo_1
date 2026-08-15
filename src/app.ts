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

const app = express()
const port = Number(process.env.PORT) || 8080

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

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173', 
  "https://frontend-instance-for-demo-800143476860.asia-south1.run.app"
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
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

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello world' })
})

app.post('/login', (req: Request, res: Response) => {
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

app.get('/files', (req: Request, res: Response) => {
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

app.get('/users', (req: Request, res: Response) => {
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

app.post('/create-user', (req: Request, res: Response) => {
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

app.put('/users/:userid', (req: Request, res: Response) => {
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

app.post('/upload-file', upload.single('uploaded_file'), (req: Request, res: Response) => {
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

app.put('/files/:id', (req: Request, res: Response) => {
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

app.delete('/files/:id', (req: Request, res: Response) => {
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