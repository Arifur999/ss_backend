import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinaryUpload } from "./cloudinary.config.js";

const storage = new CloudinaryStorage({
    cloudinary: cloudinaryUpload,
    params: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public_id: (req: any, file: any) => {
            const fileName = file.originalname
                .toLowerCase()
                .replace(/\.[^/.]+$/, "")
                .replace(/[^a-z0-9\-]/g, "-")
                .replace(/-+/g, "-");
            const uniqueName = `${Math.random().toString(36).slice(2)}-${Date.now()}-${fileName}`;
            return `furniture-business/${uniqueName}`;
        },
    },
});

export const multerUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
