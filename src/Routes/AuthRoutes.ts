import { Router } from "express";
import { register, login, refreshToken } from "../Controllers/AuthController";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);

export default router;
