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
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/-+/g, "-");
            const uniqueName = `${Math.random().toString(36).slice(2)}-${Date.now()}-${fileName}`;
            return `furniture-business/${uniqueName}`;
        },
    },
});

/**
 * The only image types this app has any reason to accept.
 *
 * There was no fileFilter at all, so any authenticated user could send any file
 * to Cloudinary. SVG is the one worth naming: Cloudinary accepts it as an image,
 * it can carry script, and it is then served from res.cloudinary.com as
 * image/svg+xml - user-controlled content on a domain the app links to. Raw
 * uploads of other types just burned the quota.
 */
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const multerUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        // One file per request. Without this, `.single("image")` still parses the
        // whole multipart body first, so a request with a hundred parts was a
        // hundred files read before one was rejected.
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
            callback(new Error(`Only JPG, PNG, WebP and GIF images are allowed (received ${file.mimetype})`));
            return;
        }
        callback(null, true);
    },
});
