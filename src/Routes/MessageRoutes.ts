import { Router } from "express";
import { createMessage, getChannelMessages, markChannelRead } from "../Controllers/MessageController";
import { requireAuth } from "../Middlewares/authMiddleware";

const router = Router();

router.get("/:channelId", requireAuth, getChannelMessages);
router.post("/", requireAuth, createMessage);
router.post("/:channelId/read", requireAuth, markChannelRead);

export default router;
