import { Router } from "express";
import { createMessage, getChannelMessages, markChannelRead } from "../Controllers/MessageController";
import { requireAuth } from "../Middlewares/authMiddleware";
import { uploadImage, handleImageUpload } from "../Controllers/UploadController";

const router = Router();

router.get("/:channelId", requireAuth, getChannelMessages);
router.post("/", requireAuth, createMessage);
router.post("/:channelId/read", requireAuth, markChannelRead);
router.post("/upload-image", requireAuth, uploadImage, handleImageUpload);

export default router;
