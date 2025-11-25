import cors from 'cors';
import express from "express";
import authRoutes from "./Routes/AuthRoutes";
import channelRoutes from './Routes/ChannelRoutes';
import roleRoutes from './Routes/RoleRoutes';
import userRoutes from './Routes/UserRoutes';

const app = express()

app.use(express.json());
app.use(cors())

const port = 3300

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/channel', channelRoutes)
app.use('/api/v1/role', roleRoutes)
app.use('/api/v1/users', userRoutes)

app.get('/', (req, res) => {
    res.send('hello world')
})

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})
