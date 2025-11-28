import cors from 'cors';
import express from "express";
import http from "http";
import bodyParser from 'body-parser';
import path from "path";
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
app.use(cors())

// Serve static files สำหรับรูปภาพ
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

initRealtime(server);

server.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})
