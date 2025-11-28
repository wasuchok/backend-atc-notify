import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { Request, Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
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

const webhookImagesDir = path.join(process.cwd(), "uploads", "images");
if (!fs.existsSync(webhookImagesDir)) {
  fs.mkdirSync(webhookImagesDir, { recursive: true });
}

const webhookStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, webhookImagesDir),
  filename: (_, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const webhookUpload = multer({
  storage: webhookStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extMatch = allowed.test(path.extname(file.originalname).toLowerCase());
    const typeMatch = allowed.test(file.mimetype);
    if (extMatch && typeMatch) {
      cb(null, true);
    } else {
      cb(new Error("อนุญาตเฉพาะไฟล์รูปภาพ (jpeg, jpg, png, gif, webp)"));
    }
  },
});

export const webhookImageUpload = webhookUpload.single("image");

export const listWebhooks = async (req: AuthenticatedRequest, res: Response) => {
  const start = Date.now();
  try {
    const userId = req.user?.uuid;
    const channelId = Number(req.params.channelId);
    if (!userId) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
    if (Number.isNaN(channelId)) return res.status(400).json({ message: "channel_id ไม่ถูกต้อง" });

    const channel = await prisma.channels.findUnique({
      where: { id: channelId },
      select: { created_by: true },
    });
    if (!channel) return res.status(404).json({ message: "ไม่พบแชลแนล" });
    const role = (req.user?.role || "").toLowerCase();
    if (role !== "admin" && channel.created_by !== userId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์ดู webhook ของแชลแนลนี้" });
    }

    const hooks = await prisma.webhook_subscriptions.findMany({
      where: { channel_id: channelId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        channel_id: true,
        url: true,
        created_at: true,
      },
    });
    const duration = Date.now() - start;
    return res.status(200).json({ message: "success", data: hooks, duration: `${duration}ms` });
  } catch (e) {
    const duration = Date.now() - start;
    console.error("List webhooks error:", e);
    return res.status(500).json({ message: "เกิดข้อผิดพลาด", duration: `${duration}ms` });
  }
};

export const createWebhook = async (req: AuthenticatedRequest, res: Response) => {
  const start = Date.now();
  try {
    const userId = req.user?.uuid;
    const role = (req.user?.role || "").toLowerCase();
    const { channel_id, url, secret_token } = req.body as {
      channel_id?: number | string;
      url?: string;
      secret_token?: string;
    };

    if (!userId) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
    const channelIdNum = typeof channel_id === "string" ? Number(channel_id) : channel_id;
    if (channelIdNum == null || Number.isNaN(Number(channelIdNum))) {
      return res.status(400).json({ message: "channel_id ไม่ถูกต้อง" });
    }
    if (!secret_token) {
      return res.status(400).json({ message: "กรุณาระบุ secret_token" });
    }
    const normalizedUrl = (() => {
      const u = (url ?? "").toString().trim();
      return u.length === 0 ? "internal" : u;
    })();

    const channel = await prisma.channels.findUnique({
      where: { id: Number(channelIdNum) },
      select: { created_by: true },
    });
    if (!channel) return res.status(404).json({ message: "ไม่พบแชลแนล" });
    if (role !== "admin" && channel.created_by !== userId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์สร้าง webhook สำหรับแชลแนลนี้" });
    }

    const created = await prisma.webhook_subscriptions.create({
      data: {
        channel_id: Number(channelIdNum),
        url: normalizedUrl,
        secret_token: secret_token.trim(),
      },
      select: {
        id: true,
        channel_id: true,
        url: true,
        created_at: true,
      },
    });

    const duration = Date.now() - start;
    return res.status(201).json({ message: "สร้าง webhook สำเร็จ", data: created, duration: `${duration}ms` });
  } catch (e) {
    const duration = Date.now() - start;
    console.error("Create webhook error:", e);
    return res.status(500).json({ message: "เกิดข้อผิดพลาด", duration: `${duration}ms` });
  }
};

export const receiveWebhook = async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const payload = (req.body ?? {}) as {
      channel_id?: number | string;
      content?: string;
      sender_uuid?: string;
      image_url?: string;
      secret_token?: string;
    };
    const { channel_id, content, sender_uuid, image_url } = payload;
    const secret =
      (req.headers["x-webhook-secret"] as string | undefined) ??
      payload.secret_token;
    const uploadedFile = req.file as any
    const fileImageUrl = uploadedFile ? `/uploads/images/${uploadedFile.filename}` : undefined;
    const finalContent = typeof content === "string" ? content.trim() : "";
    const trimmedImageUrl = typeof image_url === "string" ? image_url.trim() : undefined;
    const finalImageUrl = fileImageUrl ?? trimmedImageUrl;
    const channelIdNum = typeof channel_id === "string" ? Number(channel_id) : channel_id;
    if (channelIdNum == null || Number.isNaN(Number(channelIdNum))) {
      return res.status(400).json({ message: "channel_id ไม่ถูกต้อง" });
    }
    if (!secret) return res.status(401).json({ message: "ไม่พบ secret token" });
    if ((!finalContent || finalContent.length === 0) && !finalImageUrl) {
      return res.status(400).json({ message: "กรุณาระบุ content หรือ image_url" });
    }

    const webhook = await prisma.webhook_subscriptions.findFirst({
      where: { channel_id: Number(channelIdNum), secret_token: secret },
      select: { channel_id: true, channels: { select: { created_by: true } } },
    });
    if (!webhook) return res.status(401).json({ message: "secret ไม่ถูกต้อง" });

    const fallbackSender = process.env.WEBHOOK_DEFAULT_SENDER_UUID;
    const sender = sender_uuid ?? webhook.channels?.created_by ?? fallbackSender;
    if (!sender) {
      return res.status(400).json({
        message: "ไม่พบ sender สำหรับโพสต์ข้อความ (ใส่ sender_uuid หรือกำหนด WEBHOOK_DEFAULT_SENDER_UUID)",
      });
    }

    const message = await prisma.messages.create({
      data: {
        channel_id: Number(channelIdNum),
        type: finalImageUrl ? "image" : "webhook",
        content: finalContent,
        sender_uuid: sender,
        image_url: finalImageUrl || null,
      },
      select: {
        id: true,
        channel_id: true,
        type: true,
        content: true,
        image_url: true,
        created_at: true,
        sender_uuid: true,
        Users_messages_sender_uuidToUsers: { select: { display_name: true } },
        message_reads: { select: { user_uuid: true } },
      },
    });

    const mapped = {
      id: message.id,
      channel_id: message.channel_id,
      type: message.type,
      content: message.content,
      image_url: message.image_url,
      sender_uuid: message.sender_uuid ?? "",
      sender_name: message.Users_messages_sender_uuidToUsers?.display_name ?? "Webhook",
      created_at: message.created_at,
      read_by: message.message_reads.map((r) => r.user_uuid),
    };

    broadcastToChannel(Number(channelIdNum), {
      event: "message:new",
      data: mapped,
    });

    const duration = Date.now() - start;
    return res.status(201).json({ message: "โพสต์เข้าแชทสำเร็จ", data: mapped, duration: `${duration}ms` });
  } catch (e) {
    const duration = Date.now() - start;
    console.error("Receive webhook error:", e);
    return res.status(500).json({ message: "เกิดข้อผิดพลาด", duration: `${duration}ms` });
  }
};

export const receiveNotification = async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { channel_id, title, content, sender_uuid } = req.body as {
      channel_id?: number | string;
      title?: string;
      content?: string;
      sender_uuid?: string;
    };
    const secret =
      (req.headers["x-webhook-secret"] as string | undefined) ??
      (req.body?.secret_token as string | undefined);

    const channelIdNum = typeof channel_id === "string" ? Number(channel_id) : channel_id;
    if (channelIdNum == null || Number.isNaN(Number(channelIdNum))) {
      return res.status(400).json({ message: "channel_id ไม่ถูกต้อง" });
    }
    if (!secret) return res.status(401).json({ message: "ไม่พบ secret token" });
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: "กรุณาระบุ content" });
    }

    const webhook = await prisma.webhook_subscriptions.findFirst({
      where: { channel_id: Number(channelIdNum), secret_token: secret },
      select: { channel_id: true, channels: { select: { created_by: true } } },
    });
    if (!webhook) return res.status(401).json({ message: "secret ไม่ถูกต้อง" });

    const fallbackSender = process.env.WEBHOOK_DEFAULT_SENDER_UUID;
    const sender = sender_uuid ?? webhook.channels?.created_by ?? fallbackSender;
    if (!sender) {
      return res.status(400).json({
        message: "ไม่พบ sender สำหรับโพสต์ข้อความ (ใส่ sender_uuid หรือกำหนด WEBHOOK_DEFAULT_SENDER_UUID)",
      });
    }

    const finalMessage = String(content).trim();

    const message = await prisma.messages.create({
      data: {
        channel_id: Number(channelIdNum),
        type: "notification",
        content: finalMessage,
        sender_uuid: sender,
        message_reads: {
          create: [{ user_uuid: sender, read_at: new Date() }],
        },
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

    const mapped = {
      id: message.id,
      channel_id: message.channel_id,
      type: message.type,
      content: message.content,
      sender_uuid: message.sender_uuid ?? "",
      sender_name:
        title && title.trim().length > 0
          ? title.trim()
          : "Notification",
      created_at: message.created_at,
      read_by: message.message_reads.map((r) => r.user_uuid),
    };

    broadcastToChannel(Number(channelIdNum), {
      event: "message:new",
      data: mapped,
    });

    const duration = Date.now() - start;
    return res.status(201).json({ message: "ส่งแจ้งเตือนสำเร็จ", data: mapped, duration: `${duration}ms` });
  } catch (e) {
    const duration = Date.now() - start;
    console.error("Receive notification error:", e);
    return res.status(500).json({ message: "เกิดข้อผิดพลาด", duration: `${duration}ms` });
  }
};
