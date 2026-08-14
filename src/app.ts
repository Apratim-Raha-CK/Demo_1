import express from 'express'
import cors from 'cors'
import multer from 'multer'
import type { Request, Response } from 'express'
import USERS from './lib/users.js'
import DB_FILES from './lib/dbfiles.js'
import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'

const app = express()
const port = Number(process.env.PORT) || 8080

const DUP_DB_FILES = [...DB_FILES]

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
    const user = USERS.find((user) => user.username === username?.trim())
    if (!user || user?.password !== password) {
      throw new Error('Invalid credentials')
    }
    res.json({
      status: 'success',
      message: 'Login Successful ',
      data: {
        username: user.username,
        role: user.role,
        permissions: [...user.permissions]
      }
    })
  } catch (error: any) {
    // Fixed chaining: .status() before .json()
    res.status(401).json({ status: 'failure', message: error.message })
  }
})

app.get('/files', (req: Request, res: Response) => {
  try {
    const files = DUP_DB_FILES.map((file) => ({
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
      created_at: file.created_at,
      created_by: file.created_by
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
    created_by: newFileEntry.created_by
  })

  res.status(201).json({
    status: 'success',
    message: 'File uploaded successfully!',
    data: newFileEntry
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`)
})