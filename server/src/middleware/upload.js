/**
 * upload.js — Multer configuration for KYC document uploads.
 *
 * Storage: disk (local dev). In production, swap diskStorage for
 * multer-s3 or a stream-based strategy and point storagePath at
 * the S3 key.
 *
 * Constraints enforced:
 *   - MIME type: image/jpeg, image/png, image/webp, application/pdf
 *   - File size: 5 MB maximum
 *   - Field name: 'document' (single file)
 *   - Destination: uploads/kyc/<date>/
 *
 * Usage:
 *   import { kycUpload } from '../middleware/upload.js';
 *   router.post('/', authenticate, kycUpload, ...validators, handler);
 *
 * The middleware attaches `req.file` on success or calls next(err) on failure.
 * A custom fileFilter runs BEFORE Multer buffers anything, so over-type files
 * never touch the disk.
 */

import multer  from 'multer';
import path    from 'path';
import fs      from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// ALLOWED TYPES
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

/** Maximum file size in bytes (5 MB). */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Bucket by date so we don't put thousands of files in one folder
    const dateStr  = new Date().toISOString().slice(0, 10);           // YYYY-MM-DD
    const uploadDir = path.join(__dirname, '../../uploads/kyc', dateStr);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    // Timestamp + 6-char random suffix for uniqueness
    const unique   = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${safeBase}_${unique}${ext}`);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FILE FILTER  — runs synchronously before any disk write
// ─────────────────────────────────────────────────────────────────────────────

const fileFilter = (_req, file, cb) => {
  const ext     = path.extname(file.originalname).toLowerCase();
  const mime    = file.mimetype.toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(
      Object.assign(
        new Error(`File type '${mime}' is not allowed. Accepted: JPEG, PNG, WEBP, PDF.`),
        { statusCode: 415, code: 'INVALID_FILE_TYPE' }
      ),
      false
    );
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      Object.assign(
        new Error(`File extension '${ext}' is not allowed.`),
        { statusCode: 415, code: 'INVALID_FILE_EXTENSION' }
      ),
      false
    );
  }

  cb(null, true);
};

// ─────────────────────────────────────────────────────────────────────────────
// MULTER INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

const multerInstance = multer({
  storage,
  fileFilter,
  limits: {
    fileSize  : MAX_FILE_SIZE,
    files     : 1,        // one document per request
    fieldSize : 2 * 1024, // 2 KB for non-file fields
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single KYC document upload middleware.
 * Field name: 'document'
 *
 * Normalises Multer errors into the app's standard failure shape so the
 * global errorHandler doesn't need to know about Multer specifics.
 */
export const kycUpload = (req, res, next) => {
  multerInstance.single('document')(req, res, (err) => {
    if (!err) return next();

    // Multer-specific error codes
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error  : `File too large. Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error  : 'Only one file may be uploaded per request.',
      });
    }
    if (err.code === 'INVALID_FILE_TYPE' || err.code === 'INVALID_FILE_EXTENSION') {
      return res.status(err.statusCode || 415).json({
        success: false,
        error  : err.message,
      });
    }

    // Unexpected Multer or FS error — pass to global error handler
    next(err);
  });
};

/**
 * Guard that enforces a file MUST be present.
 * Use after kycUpload when the document field is required.
 */
export const requireFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error  : "A document file is required in the 'document' field.",
    });
  }
  next();
};

export default { kycUpload, requireFile, MAX_FILE_SIZE, ALLOWED_MIME_TYPES };
