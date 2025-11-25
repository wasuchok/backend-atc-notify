import { Router } from "express";
import { createRole, getRoles } from "../Controllers/RoleController";
import { requireAdmin, requireAuth } from "../Middlewares/authMiddleware";
const router = Router()

router.get("/", getRoles)
router.post("/create", requireAuth, requireAdmin, createRole)

export default router;
