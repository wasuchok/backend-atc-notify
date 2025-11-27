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

export const createChannel = async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
        const { name, icon_codepoint, icon_color, created_by } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "กรุณาระบุชื่อแชลแนล",
                duration: `${duration}ms`
            });
        }

        if (icon_codepoint !== undefined && Number.isNaN(Number(icon_codepoint))) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "icon_codepoint ต้องเป็นตัวเลข",
                duration: `${duration}ms`
            });
        }

        let normalizedColor: string | null = null;
        if (icon_color !== undefined && icon_color !== null) {
            normalizedColor = String(icon_color).trim();
            if (normalizedColor.startsWith("#")) {
                normalizedColor = normalizedColor.substring(1);
            }
            if (!normalizedColor) {
                normalizedColor = null;
            }
        }

        if (created_by) {
            const user = await prisma.users.findUnique({
                where: { uuid: created_by }
            });

            if (!user) {
                const duration = Date.now() - startTime;
                return res.status(404).json({
                    message: "ไม่พบผู้ใช้ที่สร้างแชลแนล",
                    duration: `${duration}ms`
                });
            }
        }

        const existing = await prisma.channels.findUnique({
            where: { name: name.trim() }
        });

        if (existing) {
            const duration = Date.now() - startTime;
            return res.status(409).json({
                message: "ชื่อนี้ถูกใช้สร้างแชลแนลแล้ว",
                duration: `${duration}ms`
            });
        }

        const channel = await prisma.channels.create({
            data: {
                name: name.trim(),
                icon_codepoint: icon_codepoint !== undefined ? Number(icon_codepoint) : null,
                icon_color: normalizedColor,
                created_by: created_by || null
            },
            select: {
                id: true,
                name: true,
                icon_codepoint: true,
                icon_color: true,
                is_active: true,
                created_by: true,
                created_at: true,
                updated_at: true
            }
        });

        const duration = Date.now() - startTime;
        return res.status(201).json({
            message: "สร้างแชลแนลสำเร็จ",
            data: channel,
            duration: `${duration}ms`
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Create channel error:", error);

        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการสร้างแชลแนล",
            duration: `${duration}ms`
        });
    }
};

export const getChannel = async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
        const userId = req.user?.uuid;
        const userRole = (req.user?.role || "").toLowerCase();
        if (!userId) {
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "กรุณาเข้าสู่ระบบ",
                duration: `${duration}ms`
            });
        }

        let roleIds: string[] = [];
        if (userRole !== "admin") {
            const roles = await prisma.user_roles.findMany({
                where: { user_uuid: userId },
                select: { role_id: true },
            });
            roleIds = roles.map((r) => r.role_id);
        }

        const orConditions: any[] = [{ created_by: userId }];
        if (roleIds.length > 0) {
            orConditions.push({
                channel_role_visibility: {
                    some: { role_id: { in: roleIds } },
                },
            });
        }

        const channels = await prisma.channels.findMany({
            where: userRole === "admin"
                ? { is_active: true }
                : {
                    is_active: true,
                    OR: orConditions,
                },
            select: {
                id: true,
                name: true,
                icon_codepoint: true,
                icon_color: true,
                is_active: true,
                created_by: true,
                created_at: true,
                updated_at: true
            },
            orderBy: { created_at: "desc" }
        });

        const enriched = await Promise.all(
            channels.map(async (channel) => {
                const [lastMessage, unreadCount] = await Promise.all([
                    prisma.messages.findFirst({
                        where: { channel_id: channel.id },
                        orderBy: { created_at: "desc" },
                        select: { content: true, created_at: true },
                    }),
                    prisma.messages.count({
                        where: {
                            channel_id: channel.id,
                            message_reads: { none: { user_uuid: userId } },
                            NOT: { sender_uuid: userId },
                        },
                    }),
                ]);

                return {
                    ...channel,
                    last_message_content: lastMessage?.content ?? null,
                    last_message_at: lastMessage?.created_at ?? null,
                    unread_count: unreadCount,
                };
            })
        );

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "ดึงแชลแนลสำเร็จ",
            data: enriched,
            duration: `${duration}ms`
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Get channel error:", error);

        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการดึงแชลแนล",
            duration: `${duration}ms`
        });
    }
};

export const getChannelRoles = async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
        const userId = req.user?.uuid;
        const userRole = (req.user?.role || "").toLowerCase();
        const channelId = Number(req.params.id);

        if (!userId) {
            const duration = Date.now() - startTime;
            return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ", duration: `${duration}ms` });
        }
        if (Number.isNaN(channelId)) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "channel_id ไม่ถูกต้อง", duration: `${duration}ms` });
        }

        const channel = await prisma.channels.findUnique({
            where: { id: channelId },
            select: { id: true, created_by: true },
        });
        if (!channel) {
            const duration = Date.now() - startTime;
            return res.status(404).json({ message: "ไม่พบแชลแนล", duration: `${duration}ms` });
        }

        const isOwner = channel.created_by === userId;
        if (!isOwner && userRole !== "admin") {
            const duration = Date.now() - startTime;
            return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง", duration: `${duration}ms` });
        }

        const [roles, visibility] = await Promise.all([
            prisma.roles.findMany({ select: { id: true, name: true } }),
            prisma.channel_role_visibility.findMany({
                where: { channel_id: channelId },
                select: { role_id: true },
            }),
        ]);

        const allowed = new Set(visibility.map((v) => v.role_id));
        const result = roles.map((r) => ({
            id: r.id,
            name: r.name,
            hasAccess: allowed.has(r.id),
        }));

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "ดึง role visibility สำเร็จ",
            data: result,
            duration: `${duration}ms`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Get channel roles error:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการดึง role",
            duration: `${duration}ms`,
        });
    }
};

export const updateChannelRoles = async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    try {
        const userId = req.user?.uuid;
        const userRole = (req.user?.role || "").toLowerCase();
        const channelId = Number(req.params.id);
        const roleIds = (req.body?.role_ids as string[] | undefined) ?? [];

        if (!userId) {
            const duration = Date.now() - startTime;
            return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ", duration: `${duration}ms` });
        }
        if (Number.isNaN(channelId)) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "channel_id ไม่ถูกต้อง", duration: `${duration}ms` });
        }
        if (!Array.isArray(roleIds)) {
            const duration = Date.now() - startTime;
            return res.status(400).json({ message: "role_ids ต้องเป็น array", duration: `${duration}ms` });
        }

        const channel = await prisma.channels.findUnique({
            where: { id: channelId },
            select: { id: true, created_by: true },
        });
        if (!channel) {
            const duration = Date.now() - startTime;
            return res.status(404).json({ message: "ไม่พบแชลแนล", duration: `${duration}ms` });
        }

        const isOwner = channel.created_by === userId;
        if (!isOwner && userRole !== "admin") {
            const duration = Date.now() - startTime;
            return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไข", duration: `${duration}ms` });
        }

        const uniqueRoleIds = Array.from(new Set(roleIds.filter((id) => typeof id === "string" && id.trim() !== "")));

        if (uniqueRoleIds.length > 0) {
            const found = await prisma.roles.findMany({
                where: { id: { in: uniqueRoleIds } },
                select: { id: true },
            });
            const foundIds = new Set(found.map((r) => r.id));
            const invalid = uniqueRoleIds.filter((id) => !foundIds.has(id));
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
            prisma.channel_role_visibility.deleteMany({ where: { channel_id: channelId } }),
            prisma.channel_role_visibility.createMany({
                data: uniqueRoleIds.map((id) => ({
                    channel_id: channelId,
                    role_id: id,
                })),
                skipDuplicates: true,
            }),
        ]);

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "บันทึก role visibility สำเร็จ",
            data: { channel_id: channelId, role_ids: uniqueRoleIds },
            duration: `${duration}ms`,
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Update channel roles error:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการบันทึก role",
            duration: `${duration}ms`,
        });
    }
};
