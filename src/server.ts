import cors from 'cors';
import express from "express";
import authRoutes from "./Routes/AuthRoutes";

const app = express()

app.use(express.json());
app.use(cors())

const port = 3300

app.use('/api/v1/auth', authRoutes);

app.get('/', (req, res) => {
    res.send('hello world')
})

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
})