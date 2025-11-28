import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { AuthenticatedRequest } from "../Middlewares/authMiddleware";

// สร้าง folder uploads ถ้ายังไม่มี
const uploadsDir = path.join(process.cwd(), "uploads", "images");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ตั้งค่า multer สำหรับเก็บไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // สร้างชื่อไฟล์: timestamp-random-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// ตั้งค่า multer middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // อนุญาตเฉพาะไฟล์รูปภาพ
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("อนุญาตเฉพาะไฟล์รูปภาพ (jpeg, jpg, png, gif, webp)"));
    }
  },
});

export const uploadImage = upload.single("image");

export const handleImageUpload = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const startTime = Date.now();
  try {
    if (!req.file) {
      const duration = Date.now() - startTime;
      return res.status(400).json({
        message: "กรุณาเลือกไฟล์รูปภาพ",
        duration: `${duration}ms`,
      });
    }

    // สร้าง URL สำหรับเข้าถึงรูปภาพ
    const imageUrl = `/uploads/images/${req.file.filename}`;

    const duration = Date.now() - startTime;
    return res.status(200).json({
      message: "อัปโหลดรูปภาพสำเร็จ",
      data: {
        url: imageUrl,
        filename: req.file.filename,
        size: req.file.size,
      },
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("Upload image error:", error);
    return res.status(500).json({
      message: error.message || "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ",
      duration: `${duration}ms`,
    });
  }
};

