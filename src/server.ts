import cors from 'cors';
import express from "express";
import http from "http";
import authRoutes from "./Routes/AuthRoutes";
import channelRoutes from './Routes/ChannelRoutes';
import messageRoutes from './Routes/MessageRoutes';
import roleRoutes from './Routes/RoleRoutes';
import userRoutes from './Routes/UserRoutes';
import { initRealtime } from './realtime';

const app = express()
const server = http.createServer(app);

app.use(express.json());
app.use(cors())

const port = 3300

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/channel', channelRoutes)
app.use('/api/v1/messages', messageRoutes)
app.use('/api/v1/role', roleRoutes)
app.use('/api/v1/users', userRoutes)

app.get('/', (req, res) => {
    res.send('hello world')
})

initRealtime(server);

server.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})
