import "dotenv/config";
import { Server } from "http";
import jwt from "jsonwebtoken";
import url from "url";
import WebSocket, { WebSocketServer } from "ws";

type RealtimePayload = {
  event: "message:new" | "message:read" | "connected" | "error";
  data: unknown;
};

const GLOBAL_BUCKET = "global";
const channelBuckets = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, { userId: string; channelKey: string }>();

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
    const isGlobal = !channelIdParam || Number.isNaN(channelId) || channelId <= 0;
    const channelKey = isGlobal ? GLOBAL_BUCKET : bucketKey(channelId);

    if (!token) {
      socket.close(4001, "token หรือ channelId ไม่ถูกต้อง");
      return;
    }

    const userId = parseUserId(token);
    if (!userId) {
      socket.close(4002, "token ไม่ถูกต้อง");
      return;
    }

    socketMeta.set(socket, { userId, channelKey });
    addSocketToBucket(channelKey, socket);

    safeSend(socket, {
      event: "connected",
      data: { channelId: isGlobal ? null : channelId, userId },
    });

    socket.on("close", () => removeSocket(channelKey, socket));
    socket.on("error", () => removeSocket(channelKey, socket));
  });
};

export const broadcastToChannel = (channelId: number, payload: RealtimePayload) => {
  const channelKey = bucketKey(channelId);
  broadcastToBucket(channelKey, payload);
  broadcastToBucket(GLOBAL_BUCKET, payload);
};

const broadcastToBucket = (key: string, payload: RealtimePayload) => {
  const listeners = channelBuckets.get(key);
  if (!listeners || listeners.size === 0) return;

  const data = JSON.stringify(payload);
  listeners.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
};

const bucketKey = (channelId: number) => `channel-${channelId}`;

const parseUserId = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
};

const addSocketToBucket = (channelKey: string, socket: WebSocket) => {
  const set = channelBuckets.get(channelKey) ?? new Set<WebSocket>();
  set.add(socket);
  channelBuckets.set(channelKey, set);
};

const removeSocket = (channelKey: string, socket: WebSocket) => {
  const set = channelBuckets.get(channelKey);
  if (set) {
    set.delete(socket);
    if (set.size === 0) {
      channelBuckets.delete(channelKey);
    }
  }
  socketMeta.delete(socket);
};

const safeSend = (socket: WebSocket, payload: RealtimePayload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};
