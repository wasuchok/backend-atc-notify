import { Router } from "express";
import { createChannel, deleteChannel, getChannel, getChannelRoles, updateChannelRoles } from "../Controllers/ChannelController";
import { requireAuth } from "../Middlewares/authMiddleware";

const router = Router();

router.post("/create", createChannel);
router.get("/", requireAuth, getChannel);
router.get("/:id/roles", requireAuth, getChannelRoles);
router.put("/:id/roles", requireAuth, updateChannelRoles);
router.delete("/:id", requireAuth, deleteChannel);

export default router;
