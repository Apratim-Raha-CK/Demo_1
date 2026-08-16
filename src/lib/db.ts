import pg from 'pg'
import USERS from './users.js'
import DB_FILES from './dbfiles.js'
import { encrypt } from './crypto.js'

const { Pool } = pg

const connectionName = process.env.INSTANCE_CONNCECTION_NAME || process.env.INSTANCE_CONNECTION_NAME
let pool: pg.Pool

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL.trim()
  })
} else if (connectionName && !process.env.DB_HOST) {
  pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: `/cloudsql/${connectionName}`
  })
} else {
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'pg@Ck123456',
    database: process.env.DB_NAME || 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 5433
  })
}

export { pool }

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

export async function initializeDatabase() {
  console.log('Initializing database tables...')
  
  // Create users table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      userid INT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions TEXT[] NOT NULL
    );
  `)

  // Create files table
  await query(`
    CREATE TABLE IF NOT EXISTS files (
      id VARCHAR(255) PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(100) NOT NULL,
      file_size BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(255) NOT NULL,
      project VARCHAR(255) DEFAULT 'general'
    );
  `)

  // Seed users if empty
  const userCheck = await query('SELECT COUNT(*) FROM users')
  const userCount = parseInt(userCheck.rows[0].count, 10)
  if (userCount === 0) {
    console.log('Seeding initial users...')
    for (const user of USERS) {
      let pwd = user.password
      if (!pwd.includes(':')) {
        pwd = encrypt(pwd)
      }
      await query(
        'INSERT INTO users (userid, username, password, role, permissions) VALUES ($1, $2, $3, $4, $5)',
        [user.userid, user.username, pwd, user.role, user.permissions]
      )
    }
  }

  // Seed files if empty
  const fileCheck = await query('SELECT COUNT(*) FROM files')
  const fileCount = parseInt(fileCheck.rows[0].count, 10)
  if (fileCount === 0) {
    console.log('Seeding initial files...')
    const mappedFiles = DB_FILES.map((file, index) => {
      let project = 'general'
      if (index < 2) project = 'project1'
      else if (index < 4) project = 'project2'
      return {
        ...file,
        project
      }
    })

    for (const file of mappedFiles) {
      await query(
        'INSERT INTO files (id, file_name, file_type, file_size, created_at, created_by, project) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [file.id, file.file_name, file.file_type, file.file_size, file.created_at, file.created_by, file.project]
      )
    }
  }

  console.log('Database initialization complete.')
}
