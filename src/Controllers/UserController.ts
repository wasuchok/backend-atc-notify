import { PrismaPg } from "@prisma/adapter-pg";
import { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { AuthenticatedRequest } from "../Middlewares/authMiddleware";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
});

export const getUsers = async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
        const users = await prisma.users.findMany({
            orderBy: { created_at: "desc" },
            select: {
                uuid: true,
                email: true,
                display_name: true,
                role: true,
                branch: true,
                team: true,
                created_at: true,
            },
        });

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "ดึงผู้ใช้สำเร็จ",
            data: users,
            duration: `${duration}ms`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Get users error:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการดึงผู้ใช้",
            duration: `${duration}ms`,
        });
    }
};

export const getUserRoles = async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
        const userId = req.params.id;
        if (!userId) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "กรุณาระบุ user id", duration: `${duration}ms` });
        }

        const user = await prisma.users.findUnique({
            where: { uuid: userId },
            select: { uuid: true },
        });
        if (!user) {
            const duration = Date.now() - startTime;
            return res.status(404).json({ message: "ไม่พบผู้ใช้", duration: `${duration}ms` });
        }

        const roles = await prisma.user_roles.findMany({
            where: { user_uuid: userId },
            select: {
                roles: { select: { id: true, name: true } },
            },
        });

        const data = roles.map((r) => r.roles);
        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "ดึง role ผู้ใช้สำเร็จ",
            data,
            duration: `${duration}ms`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Get user roles error:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการดึง role ผู้ใช้",
            duration: `${duration}ms`,
        });
    }
};

export const updateUserRoles = async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
        const userId = req.params.id;
        const roleIds = (req.body?.role_ids as string[] | undefined) ?? [];

        if (!userId) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "กรุณาระบุ user id", duration: `${duration}ms` });
        }

        if (!Array.isArray(roleIds)) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "role_ids ต้องเป็น array", duration: `${duration}ms` });
        }

        const user = await prisma.users.findUnique({
            where: { uuid: userId },
            select: { uuid: true },
        });
        if (!user) {
            const duration = Date.now() - startTime;
            return res.status(404).json({ message: "ไม่พบผู้ใช้", duration: `${duration}ms` });
        }

        const uniqueRoleIds = Array.from(
            new Set(roleIds.filter((id) => typeof id === "string" && id.trim() !== "")),
        );

        if (uniqueRoleIds.length > 0) {
            const found = await prisma.roles.findMany({
                where: { id: { in: uniqueRoleIds } },
                select: { id: true },
            });
            const foundSet = new Set(found.map((r) => r.id));
            const invalid = uniqueRoleIds.filter((id) => !foundSet.has(id));
            if (invalid.length > 0) {
                const duration = Date.now() - startTime;
                return res.status(400).json({
                    message: "พบ role_id ไม่ถูกต้อง",
                    invalid_role_ids: invalid,
                    duration: `${duration}ms`,
                });
            }
        }

        await prisma.$transaction([
            prisma.user_roles.deleteMany({ where: { user_uuid: userId } }),
            prisma.user_roles.createMany({
                data: uniqueRoleIds.map((id) => ({
                    user_uuid: userId,
                    role_id: id,
                })),
                skipDuplicates: true,
            }),
        ]);

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "อัปเดต role ผู้ใช้สำเร็จ",
            data: { user_id: userId, role_ids: uniqueRoleIds },
            duration: `${duration}ms`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Update user roles error:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการอัปเดต role ผู้ใช้",
            duration: `${duration}ms`,
        });
    }
};
