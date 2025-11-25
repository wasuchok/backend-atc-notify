import { Router } from "express";
import { getUsers, getUserRoles, updateUserRoles } from "../Controllers/UserController";
import { requireAdmin, requireAuth } from "../Middlewares/authMiddleware";

const router = Router();

router.get("/", requireAuth, requireAdmin, getUsers);
router.get("/:id/roles", requireAuth, requireAdmin, getUserRoles);
router.put("/:id/roles", requireAuth, requireAdmin, updateUserRoles);

export default router;
