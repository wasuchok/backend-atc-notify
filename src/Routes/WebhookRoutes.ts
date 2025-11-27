import { Router } from "express";
import { createWebhook, listWebhooks, receiveNotification, receiveWebhook } from "../Controllers/WebhookController";
import { requireAuth } from "../Middlewares/authMiddleware";

const router = Router();

router.get("/:channelId", requireAuth, listWebhooks);
router.post("/", requireAuth, createWebhook);
router.post("/incoming", receiveWebhook);
router.post("/notify", receiveNotification);

export default router;
