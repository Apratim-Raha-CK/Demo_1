import express, { application } from 'express'
import cors from 'cors'
import multer from 'multer'
import type { Request, Response } from 'express'
import USERS from './lib/users.js'
import DB_FILES from './lib/dbfiles.js'
import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'


const app = express()

const port = Number(process.env.PORT) || 8080

const DUP_DB_FILES= [...DB_FILES]

app.use(express.json())
app.use(cors({
  origin: true,
  credentials: true
}))

app.use(cookieParser())

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './tmp/my-uploads')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix)
  }
})

const upload = multer({ storage });



app.get('/', (req: Request, res: Response) => {
    res.json({ message: "Hello world" })
})

app.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const user = USERS.find((user) => user.username === username?.trim())
        if(! user || user?.password !== password){
            throw new Error('Invalid credentials')
        }
        res.json({status:'success', message: "Login Successful ", data: { username:user.username, role: user.role, permissions: [...user.permissions] } })

    } catch (error:any) {
        res.json({status:'failure',message:error.message}).status(401)

    }
})

app.get('/files',(req:Request,res:Response)=>{
    try {
        //Logic to check if the user has the permission to do the operation

        const files= DUP_DB_FILES.map((file)=>{
        return {
        file_name: file.file_name,
        file_type: file.file_type,
        file_size:file.file_size,
        created_at: file.created_at,
        created_by: file.created_by,
        }
        })

        res.json({status:'success',message:"Files fetched successfully",data:{files}}).status(200)

        
    } catch (error:any) {
        res.json({status:'failure',message:error.message})
        
    }
})

// app.post('/files',(req:Request,res:Response)=>{
//     const {title,type,created_by}= req.body;

//     //Logic to check if the user has the permission to do the operation

//     try {
//         if(!title || !type ||!created_by){
//             throw new Error('Insufficient data')
//         }

//         if(type?.trim() != 'csv' && type?.trim() != 'xlsx'){
//             throw new Error('Invalid file type')
//         }

//         const new_file_obj={
//             id: randomUUID(),
//             file_name: title?.trim(),
//             file_type: type?.trim(),
//             created_at: new Date(),
//             created_by: created_by?.trim()
//         }

//         DUP_DB_FILES.push({...new_file_obj})



//         res.json({status:'success',message:'File created successfullt',data:{
//             file_name:new_file_obj.file_name,
//             file_type:new_file_obj.file_type,
//             created_at:new_file_obj.created_at,
//             created_by:new_file_obj.created_by
//         }}).status(201)
        
//     } catch (error:any) {
//         res.json({status:'failure',message:error.message})
        
//     }
// })

app.post('/upload-file', upload.single('uploaded_file'),(req:Request,res:Response)=>{
    if (!req.file) return res.status(400).json({ error: 'No file.' });


    const newFileEntry = {
      file_name: req.file.originalname,
      unique_name: req.file.filename,
      file_path: req.file.path,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      created_at: new Date(),
      created_by: "Admin",
    };

    if(req?.cookies?.user_data ){
        const userData= JSON?.parse(req.cookies.user_data) ?? "Admin"
        newFileEntry.created_by= userData?.username
        
    }

    DUP_DB_FILES.push({
        id:newFileEntry.unique_name,
        file_name:newFileEntry.file_name,
        file_type:newFileEntry.file_type,
        file_size:newFileEntry.file_size,
        created_at:newFileEntry.created_at,
        created_by:newFileEntry.created_by
    })
    
    res.json({status: 'success', message: 'File uploaded successfully!', data: newFileEntry });
})




app.listen(port,'0.0.0.0', () => {
    console.log(`Server running on port ${port}`)
}) 

