import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
});

type FetchFn = (input: any, init?: any) => Promise<any>;
const fetchFn: FetchFn = (globalThis as any).fetch
  ? (globalThis as any).fetch
  : ((...args: any[]) =>
      import("node-fetch").then(({ default: f }) => (f as any)(...args)));

type MessagePayload = {
  event: "message.new";
  data: {
    id: number;
    channel_id: number;
    content: string;
    sender_uuid: string;
    created_at: string;
  };
};

export const postWebhooks = async (channelId: number, payload: MessagePayload) => {
  try {
    const hooks = await prisma.webhook_subscriptions.findMany({
      where: { channel_id: channelId },
      select: { url: true, secret_token: true },
    });

    hooks.forEach(async (hook) => {
      try {
        await fetchFn(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": hook.secret_token ?? "",
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error("Webhook send failed", hook.url, e);
      }
    });
  } catch (e) {
    console.error("Webhook dispatch error", e);
  }
};
