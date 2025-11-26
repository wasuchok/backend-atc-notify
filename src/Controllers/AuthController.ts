
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set");
}

const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
if (!jwtRefreshSecret) {
    throw new Error("JWT_REFRESH_SECRET is not set");
}

const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })),
});

const accessTokenExpiry = "1h";
const refreshTokenExpiryDays = 7;

const buildAccessToken = (user: { uuid: string; email: string; role: string }) =>
    jwt.sign(
        {
            sub: user.uuid,
            email: user.email,
            role: user.role
        },
        jwtSecret,
        { expiresIn: accessTokenExpiry }
    );

const buildRefreshToken = (userUuid: string) =>
    jwt.sign(
        {
            sub: userUuid
        },
        jwtRefreshSecret,
        { expiresIn: `${refreshTokenExpiryDays}d` }
    );

const getTokenExpiryDate = (token: string) => {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (decoded?.exp) {
        return new Date(decoded.exp * 1000);
    }
    return new Date(Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000);
};

export const register = async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const { email, password, display_name, role, branch, team } = req.body;


        if (!email || !password || !display_name) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "กรุณากรอกข้อมูลให้ครบถ้วน (อีเมล, รหัสผ่าน, ชื่อแสดงผล)",
                duration: `${duration}ms`
            });
        }


        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "รูปแบบอีเมลไม่ถูกต้อง",
                duration: `${duration}ms`
            });
        }


        const existingUser = await prisma.users.findUnique({
            where: { email }
        });

        if (existingUser) {
            const duration = Date.now() - startTime;
            return res.status(409).json({
                message: "อีเมลนี้ถูกใช้งานแล้ว",
                duration: `${duration}ms`
            });
        }


        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);


        const user = await prisma.users.create({
            data: {
                email,
                password: hashedPassword,
                display_name,
                role: role || "employee",
                branch: branch ? branch.toUpperCase() : null,
                team : team ? team.toUpperCase() : null,
            },
            select: {
                uuid: true,
                email: true,
                display_name: true,
                role: true,
                branch: true,
                team: true,
                created_at: true
            }
        });

        const duration = Date.now() - startTime;

        return res.status(201).json({
            message: "ลงทะเบียนสำเร็จ",
            data: user,
            duration: `${duration}ms`
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Register error:", error);

        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการลงทะเบียน",
            duration: `${duration}ms`
        });
    }
};

export const login = async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "กรุณากรอกอีเมลและรหัสผ่าน",
                duration: `${duration}ms`
            });
        }

        const user = await prisma.users.findUnique({
            where: { email },
            select: {
                uuid: true,
                email: true,
                display_name: true,
                role: true,
                branch: true,
                team: true,
                created_at: true,
                password: true
            }
        });

        if (!user) {
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
                duration: `${duration}ms`
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
                duration: `${duration}ms`
            });
        }

        const accessToken = buildAccessToken(user);
        const refreshToken = buildRefreshToken(user.uuid);
        const refreshExpiresAt = getTokenExpiryDate(refreshToken);

        await prisma.refreshTokens.create({
            data: {
                user_uuid: user.uuid,
                refresh_token: refreshToken,
                ip_address: req.ip || undefined,
                user_agent: req.get("user-agent") || undefined,
                expires_at: refreshExpiresAt
            }
        });

        const { password: _password, ...safeUser } = user;
        const duration = Date.now() - startTime;

        return res.status(200).json({
            message: "เข้าสู่ระบบสำเร็จ",
            data: {
                user: safeUser,
                accessToken,
                refreshToken
            },
            duration: `${duration}ms`
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Login error:", error);

        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ",
            duration: `${duration}ms`
        });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const incomingToken = req.body.refreshToken as string | undefined;

        if (!incomingToken) {
            const duration = Date.now() - startTime;
            return res.status(400).json({
                message: "กรุณาส่ง refresh token",
                duration: `${duration}ms`
            });
        }

        let payload: jwt.JwtPayload;
        try {
            payload = jwt.verify(incomingToken, jwtRefreshSecret) as jwt.JwtPayload;
        } catch {
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "refresh token ไม่ถูกต้อง",
                duration: `${duration}ms`
            });
        }

        const tokenRecord = await prisma.refreshTokens.findFirst({
            where: { refresh_token: incomingToken, is_revoked: false },
            select: { id: true, user_uuid: true, expires_at: true }
        });

        if (!tokenRecord || (payload.sub && payload.sub !== tokenRecord.user_uuid)) {
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "refresh token ไม่ถูกต้อง",
                duration: `${duration}ms`
            });
        }

        if (tokenRecord.expires_at && tokenRecord.expires_at.getTime() < Date.now()) {
            await prisma.refreshTokens.update({
                where: { id: tokenRecord.id },
                data: { is_revoked: true }
            });
            const duration = Date.now() - startTime;
            return res.status(401).json({
                message: "refresh token หมดอายุ",
                duration: `${duration}ms`
            });
        }

        const user = await prisma.users.findUnique({
            where: { uuid: tokenRecord.user_uuid },
            select: {
                uuid: true,
                email: true,
                display_name: true,
                role: true,
                branch: true,
                team: true,
                created_at: true
            }
        });

        if (!user) {
            const duration = Date.now() - startTime;
            return res.status(404).json({
                message: "ไม่พบผู้ใช้",
                duration: `${duration}ms`
            });
        }

        const newAccessToken = buildAccessToken(user);
        const newRefreshToken = buildRefreshToken(user.uuid);
        const newRefreshExpiresAt = getTokenExpiryDate(newRefreshToken);

        await prisma.$transaction([
            prisma.refreshTokens.updateMany({
                where: { refresh_token: incomingToken },
                data: { is_revoked: true }
            }),
            prisma.refreshTokens.create({
                data: {
                    user_uuid: user.uuid,
                    refresh_token: newRefreshToken,
                    ip_address: req.ip || undefined,
                    user_agent: req.get("user-agent") || undefined,
                    expires_at: newRefreshExpiresAt
                }
            })
        ]);

        const duration = Date.now() - startTime;
        return res.status(200).json({
            message: "ออก token ใหม่สำเร็จ",
            data: {
                user,
                accessToken: newAccessToken,
                refreshToken: newRefreshToken
            },
            duration: `${duration}ms`
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error("Refresh token error:", error);

        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการออก token ใหม่",
            duration: `${duration}ms`
        });
    }
};
