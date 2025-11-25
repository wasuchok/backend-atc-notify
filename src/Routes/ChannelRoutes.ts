import { Router } from "express";
import { createChannel, getChannel, getChannelRoles, updateChannelRoles } from "../Controllers/ChannelController";
import { requireAuth } from "../Middlewares/authMiddleware";

const router = Router();

router.post("/create", createChannel);
router.get("/", requireAuth, getChannel);
router.get("/:id/roles", requireAuth, getChannelRoles);
router.put("/:id/roles", requireAuth, updateChannelRoles);

export default router;
