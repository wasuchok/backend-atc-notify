import cors from 'cors';
import express from "express";
import http from "http";
import bodyParser from 'body-parser';
import path from "path";
import fs from "fs";
import authRoutes from "./Routes/AuthRoutes";
import channelRoutes from './Routes/ChannelRoutes';
import messageRoutes from './Routes/MessageRoutes';
import roleRoutes from './Routes/RoleRoutes';
import userRoutes from './Routes/UserRoutes';
import webhookRoutes from './Routes/WebhookRoutes';
import { initRealtime } from './realtime';

const app = express()
const server = http.createServer(app);

// ใช้ body-parser โดยตรงเพื่อรองรับ large payload (50MB)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ตั้งค่า CORS ให้รองรับ static files
app.use(cors({
  origin: true, // อนุญาตทุก origin
  credentials: true,
}))

// Serve static files สำหรับรูปภาพ (ต้องมี CORS headers)
app.use('/uploads', (req, res, next) => {
  // เพิ่ม CORS headers สำหรับ static files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  // จัดการ OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}, express.static(path.join(process.cwd(), 'uploads'), {
  setHeaders: (res, filePath) => {
    // เพิ่ม headers สำหรับ static files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));

const port = 3300

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/channel', channelRoutes)
app.use('/api/v1/messages', messageRoutes)
app.use('/api/v1/role', roleRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/webhooks', webhookRoutes)

app.get('/', (req, res) => {
  res.send('hello world')
})

// Route สำหรับทดสอบ static files
app.get('/test-upload', (req, res) => {
  const uploadsPath = path.join(process.cwd(), 'uploads', 'images');
  try {
    const files = fs.readdirSync(uploadsPath);
    res.json({
      uploadsPath,
      files: files.slice(0, 10), // แสดง 10 ไฟล์แรก
      totalFiles: files.length,
      message: 'Static files test endpoint'
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      uploadsPath,
      message: 'Error reading uploads directory'
    });
  }
})

initRealtime(server);

// Listen on all network interfaces (0.0.0.0) เพื่อให้เข้าถึงได้จาก IP อื่น
server.listen(port, '0.0.0.0', () => {
  console.log(`App listening at http://0.0.0.0:${port}`)
  console.log(`Local access: http://localhost:${port}`)
  console.log(`Network access: http://10.17.3.244:${port}`)
})
