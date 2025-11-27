import "dotenv/config";
import { Server } from "http";
import jwt from "jsonwebtoken";
import url from "url";
import WebSocket, { WebSocketServer } from "ws";

type RealtimePayload = {
  event: "message:new" | "message:read" | "connected" | "error";
  data: unknown;
};

const channelBuckets = new Map<number, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, { userId: string; channelId: number }>();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is not set");
}

export const initRealtime = (server: Server) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, req) => {
    const baseUrl = `http://${req.headers.host ?? "localhost"}`;
    const query = new url.URL(req.url ?? "", baseUrl).searchParams;

    const token = query.get("token");
    const channelIdParam = query.get("channelId");
    const channelId = channelIdParam ? Number(channelIdParam) : NaN;

    if (!token || Number.isNaN(channelId)) {
      socket.close(4001, "token หรือ channelId ไม่ถูกต้อง");
      return;
    }

    const userId = parseUserId(token);
    if (!userId) {
      socket.close(4002, "token ไม่ถูกต้อง");
      return;
    }

    socketMeta.set(socket, { userId, channelId });
    addSocketToChannel(channelId, socket);

    safeSend(socket, {
      event: "connected",
      data: { channelId, userId },
    });

    socket.on("close", () => removeSocket(channelId, socket));
    socket.on("error", () => removeSocket(channelId, socket));
  });
};

export const broadcastToChannel = (channelId: number, payload: RealtimePayload) => {
  const listeners = channelBuckets.get(channelId);
  if (!listeners || listeners.size === 0) return;

  const data = JSON.stringify(payload);
  listeners.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
};

const parseUserId = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
};

const addSocketToChannel = (channelId: number, socket: WebSocket) => {
  const set = channelBuckets.get(channelId) ?? new Set<WebSocket>();
  set.add(socket);
  channelBuckets.set(channelId, set);
};

const removeSocket = (channelId: number, socket: WebSocket) => {
  const set = channelBuckets.get(channelId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) {
      channelBuckets.delete(channelId);
    }
  }
  socketMeta.delete(socket);
};

const safeSend = (socket: WebSocket, payload: RealtimePayload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};
