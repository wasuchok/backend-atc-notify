import { PrismaPg } from "@prisma/adapter-pg";
import { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
});

export const createRole = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ message: "กรุณาระบุชื่อสิทธิ์" });
        }

        const existing = await prisma.roles.findUnique({
            where: { name: name.trim() }
        });

        if (existing) {
            return res.status(409).json({ message: "ชื่อสิทธิ์นี้ถูกใช้แล้ว" });
        }

        const role = await prisma.roles.create({
            data: { name: name.trim() },
            select: { id: true, name: true, created_at: true }
        });

        return res.status(201).json({
            message: "สร้างสิทธิ์สำเร็จ",
            data: role
        });

    } catch (error) {
        console.error("Create role error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการสร้างสิทธิ์" });
    }
}

export const getRoles = async (req: Request, res: Response) => {
    try {
        const roles = await prisma.roles.findMany({
            orderBy: { created_at: "desc" },
            select: { id: true, name: true, created_at: true }
        });

        return res.status(200).json({
            message: "ดึงสิทธิ์สำเร็จ",
            data: roles
        });

    } catch (error) {
        console.error("Get roles error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงสิทธิ์" });
    }
}
