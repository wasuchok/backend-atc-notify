import { PrismaPg } from "@prisma/adapter-pg";
import { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { AuthenticatedRequest } from "../Middlewares/authMiddleware";
import { broadcastToChannel } from "../realtime";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
});

const mapMessage = (message: any) => ({
  id: message.id,
  channel_id: message.channel_id,
  type: message.type,
  content: message.content,
  sender_uuid: message.sender_uuid,
  sender_name: message.Users_messages_sender_uuidToUsers?.display_name ?? "ไม่ระบุ",
  created_at: message.created_at,
  read_by: (message.message_reads || []).map((r: any) => r.user_uuid),
});

const ensureChannelAccess = async (
  channelId: number,
  userId: string,
  userRole?: string,
) => {
  const channel = await prisma.channels.findUnique({
    where: { id: channelId },
    select: { id: true, created_by: true },
  });
  if (!channel) return { allowed: false, reason: "ไม่พบแชลแนล" };

  if (userRole?.toLowerCase() === "admin" || channel.created_by === userId) {
    return { allowed: true };
  }

  const roles = await prisma.user_roles.findMany({
    where: { user_uuid: userId },
    select: { role_id: true },
  });
  const roleIds = roles.map((r) => r.role_id);

  if (roleIds.length === 0) {
    return { allowed: false, reason: "ไม่มีสิทธิ์เข้าถึงแชลแนลนี้" };
  }

  const visibility = await prisma.channel_role_visibility.count({
    where: { channel_id: channelId, role_id: { in: roleIds } },
  });

  return visibility > 0
    ? { allowed: true }
    : { allowed: false, reason: "ไม่มีสิทธิ์เข้าถึงแชลแนลนี้" };
};

const markMessagesAsRead = async (
  channelId: number,
  userId: string,
  messageIds?: number[],
) => {
  const whereClause: any = { channel_id: channelId };
  if (Array.isArray(messageIds) && messageIds.length > 0) {
    whereClause.id = { in: messageIds };
  }

  const unread = await prisma.messages.findMany({
    where: {
      ...whereClause,
      message_reads: { none: { user_uuid: userId } },
      NOT: { sender_uuid: userId },
    },
    select: { id: true },
  });

  if (unread.length === 0) return [];

  await prisma.message_reads.createMany({
    data: unread.map((m) => ({
      message_id: m.id,
      user_uuid: userId,
      read_at: new Date(),
    })),
    skipDuplicates: true,
  });

  const ids = unread.map((m) => m.id);
  broadcastToChannel(channelId, {
    event: "message:read",
    data: { messageIds: ids, userId },
  });

  return ids;
};

export const getChannelMessages = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.uuid;
    const userRole = req.user?.role;
    const channelId = Number(req.params.channelId);

    if (!userId) {
      const duration = Date.now() - startTime;
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ", duration: `${duration}ms` });
    }
    if (Number.isNaN(channelId)) {
      const duration = Date.now() - startTime;
      return res.status(400).json({ message: "channelId ไม่ถูกต้อง", duration: `${duration}ms` });
    }

    const access = await ensureChannelAccess(channelId, userId, userRole);
    if (!access.allowed) {
      const duration = Date.now() - startTime;
      return res.status(403).json({ message: access.reason, duration: `${duration}ms` });
    }

    const messages = await prisma.messages.findMany({
      where: { channel_id: channelId },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        channel_id: true,
        type: true,
        content: true,
        created_at: true,
        sender_uuid: true,
        Users_messages_sender_uuidToUsers: { select: { display_name: true } },
        message_reads: { select: { user_uuid: true } },
      },
    });

    const data = messages.map(mapMessage);
    await markMessagesAsRead(channelId, userId);

    const duration = Date.now() - startTime;
    return res.status(200).json({
      message: "ดึงข้อความสำเร็จ",
      data,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Get channel messages error:", error);
    return res.status(500).json({
      message: "เกิดข้อผิดพลาดในการดึงข้อความ",
      duration: `${duration}ms`,
    });
  }
};

export const createMessage = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.uuid;
    const userRole = req.user?.role;
    const { channel_id, content, type } = req.body as {
      channel_id?: number | string;
      content?: string;
      type?: string;
    };

    const channelId = typeof channel_id === "string" ? Number(channel_id) : channel_id;
    if (!userId) {
      const duration = Date.now() - startTime;
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ", duration: `${duration}ms` });
    }
    if (channelId === undefined || channelId === null || Number.isNaN(Number(channelId))) {
      const duration = Date.now() - startTime;
      return res.status(400).json({ message: "channel_id ไม่ถูกต้อง", duration: `${duration}ms` });
    }
    if (!content || !String(content).trim()) {
      const duration = Date.now() - startTime;
      return res.status(400).json({ message: "กรุณาระบุข้อความ", duration: `${duration}ms` });
    }

    const access = await ensureChannelAccess(Number(channelId), userId, userRole);
    if (!access.allowed) {
      const duration = Date.now() - startTime;
      return res.status(403).json({ message: access.reason, duration: `${duration}ms` });
    }

    const message = await prisma.messages.create({
      data: {
        channel_id: Number(channelId),
        type: type || "text",
        content: String(content).trim(),
        sender_uuid: userId,
        message_reads: { create: [{ user_uuid: userId, read_at: new Date() }] },
      },
      select: {
        id: true,
        channel_id: true,
        type: true,
        content: true,
        created_at: true,
        sender_uuid: true,
        Users_messages_sender_uuidToUsers: { select: { display_name: true } },
        message_reads: { select: { user_uuid: true } },
      },
    });

    const mapped = mapMessage(message);
    broadcastToChannel(Number(channelId), {
      event: "message:new",
      data: mapped,
    });

    const duration = Date.now() - startTime;
    return res.status(201).json({
      message: "ส่งข้อความสำเร็จ",
      data: mapped,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Create message error:", error);
    return res.status(500).json({
      message: "เกิดข้อผิดพลาดในการส่งข้อความ",
      duration: `${duration}ms`,
    });
  }
};

export const markChannelRead = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.uuid;
    const userRole = req.user?.role;
    const channelId = Number(req.params.channelId);
    const messageIds = Array.isArray(req.body?.message_ids)
      ? req.body.message_ids
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id))
      : undefined;

    if (!userId) {
      const duration = Date.now() - startTime;
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ", duration: `${duration}ms` });
    }
    if (Number.isNaN(channelId)) {
      const duration = Date.now() - startTime;
      return res.status(400).json({ message: "channelId ไม่ถูกต้อง", duration: `${duration}ms` });
    }

    const access = await ensureChannelAccess(channelId, userId, userRole);
    if (!access.allowed) {
      const duration = Date.now() - startTime;
      return res.status(403).json({ message: access.reason, duration: `${duration}ms` });
    }

    const marked = await markMessagesAsRead(channelId, userId, messageIds);
    const duration = Date.now() - startTime;
    return res.status(200).json({
      message: "อัปเดตสถานะอ่านสำเร็จ",
      data: { message_ids: marked },
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Mark read error:", error);
    return res.status(500).json({
      message: "เกิดข้อผิดพลาดในการอัปเดตสถานะอ่าน",
      duration: `${duration}ms`,
    });
  }
};
