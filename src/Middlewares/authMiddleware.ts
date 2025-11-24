import "dotenv/config";
import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";

export interface AuthenticatedRequest extends Request {
    user?: {
        uuid: string;
        email?: string;
        role?: string;
    };
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set");
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "ไม่พบหรือรูปแบบ Authorization header ไม่ถูกต้อง" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
        const userId = typeof payload.sub === "string" ? payload.sub : undefined;

        if (!userId) {
            return res.status(401).json({ message: "token ไม่ถูกต้อง" });
        }

        req.user = {
            uuid: userId,
            email: typeof payload.email === "string" ? payload.email : undefined,
            role: typeof payload.role === "string" ? payload.role : undefined,
        };

        return next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(401).json({ message: "token ไม่ถูกต้องหรือหมดอายุ" });
    }
};

const requireRole = (role: "admin" | "employee") => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user?.role) {
            return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง (ไม่พบ role)" });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
        }

        return next();
    };
};

export const requireAdmin = requireRole("admin");
export const requireMember = requireRole("employee");

export const requireSelfOrAdmin = (paramKey = "id") => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ" });
        }

        // Admin can access any user id
        if (req.user.role === "admin") {
            return next();
        }

        const targetId = req.params?.[paramKey];
        if (!targetId) {
            return res.status(400).json({ message: `ไม่พบ ${paramKey} ในพาธ` });
        }

        if (req.user.uuid !== targetId) {
            return res.status(403).json({ message: "member สามารถเข้าถึงข้อมูลของตนเองเท่านั้น" });
        }

        return next();
    };
};
