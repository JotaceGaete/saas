import cors from 'cors';
import "dotenv/config";
import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());

const PORT = Number(process.env.PORT || 3001);
const MAX_VIDEO_SECONDS = 30;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const TMP_DIR = path.resolve("tmp");

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/avi",
  "application/octet-stream",
]);

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("INVALID_FILE_TYPE"));
    }
    cb(null, true);
  },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({ level: "info", event, ...meta, ts: new Date().toISOString() }));
}

function logError(event, meta = {}) {
  console.error(JSON.stringify({ level: "error", event, ...meta, ts: new Date().toISOString() }));
}

async function ensureTmpDir() {
  await fsp.mkdir(TMP_DIR, { recursive: true });
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      logError("tmp_cleanup_failed", { filePath, message: error.message });
    }
  }
}

function buildPublicUrl(key) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/${key}`;
}

async function getVideoDurationSeconds(inputPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const duration = Number.parseFloat(String(stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("INVALID_VIDEO_DURATION");
  return duration;
}

async function transcodeVideo(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-t", String(MAX_VIDEO_SECONDS),
    "-vf", "scale=1280:-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "28",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    "-y", outputPath,
  ]);
}

async function generateThumbnail(videoPath, thumbPath) {
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-ss", "00:00:01",
    "-vframes", "1",
    "-q:v", "2",
    "-y", thumbPath,
  ]);
}

async function uploadFileToR2({ key, filePath, contentType }) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_VIDEOS,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
  }));
}

function validateRequiredEnv() {
  const required = [
    "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_VIDEOS", "R2_PUBLIC_BASE_URL",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`MISSING_ENV:${missing.join(",")}`);
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/upload-video", upload.single("file"), async (req, res) => {
  const inputPath = req.file?.path;
  let outputPath;
  let thumbPath;

  try {
    validateRequiredEnv();

    const { businessId, productId } = req.body;

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se recibió archivo", code: "MISSING_FILE" });
    }

    if (!businessId || !productId) {
      return res.status(400).json({ ok: false, error: "Faltan businessId o productId", code: "MISSING_IDENTIFIERS" });
    }

    const tempId = randomUUID();
    outputPath = path.join(TMP_DIR, `${tempId}.mp4`);
    thumbPath = path.join(TMP_DIR, `${tempId}.jpg`);

    const durationSeconds = await getVideoDurationSeconds(inputPath);

    if (durationSeconds > MAX_VIDEO_SECONDS) {
      return res.status(400).json({
        ok: false,
        error: `El video supera el máximo de ${MAX_VIDEO_SECONDS} segundos`,
        code: "VIDEO_TOO_LONG",
        duration_seconds: Number(durationSeconds.toFixed(2)),
      });
    }

    await transcodeVideo(inputPath, outputPath);
    await generateThumbnail(outputPath, thumbPath);

    const videoKey = `products/${businessId}/${productId}/video.mp4`;
    const thumbKey = `products/${businessId}/${productId}/thumb.jpg`;

    await uploadFileToR2({ key: videoKey, filePath: outputPath, contentType: "video/mp4" });
    await uploadFileToR2({ key: thumbKey, filePath: thumbPath, contentType: "image/jpeg" });

    logInfo("video_upload_success", {
      businessId, productId,
      size: req.file.size,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      videoKey, thumbKey,
    });

    return res.json({
      ok: true,
      video_url: buildPublicUrl(videoKey),
      thumbnail_url: buildPublicUrl(thumbKey),
      video_path: videoKey,
      thumbnail_path: thumbKey,
    });
  } catch (error) {
    logError("video_upload_failed", { message: error.message, code: error.code || null });
    return res.status(500).json({ ok: false, error: "Falló el procesamiento o la subida del video", code: "UPLOAD_VIDEO_FAILED" });
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
    await safeUnlink(thumbPath);
  }
});

// Multer error handler (LIMIT_FILE_SIZE, INVALID_FILE_TYPE)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ ok: false, error: "El archivo supera el tamaño máximo permitido", code: "FILE_TOO_LARGE" });
  }
  if (err.message === "INVALID_FILE_TYPE") {
    return res.status(400).json({ ok: false, error: "Tipo de archivo no permitido", code: "INVALID_FILE_TYPE" });
  }
  next(err);
});

async function deleteFileFromR2(key) {
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_VIDEOS, Key: key }));
}

app.post("/delete-media", express.json(), async (req, res) => {
  try {
    validateRequiredEnv();
    const { paths } = req.body;
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ ok: false, error: "Debes enviar un arreglo de paths", code: "INVALID_PATHS" });
    }
    for (const key of paths) {
      if (!key || typeof key !== "string") continue;
      await deleteFileFromR2(key);
    }
    logInfo("media_delete_success", { count: paths.length });
    return res.json({ ok: true, deleted: paths });
  } catch (error) {
    logError("media_delete_failed", { message: error.message, code: error.code || null });
    return res.status(500).json({ ok: false, error: "Falló el borrado de media", code: "DELETE_MEDIA_FAILED" });
  }
});

async function bootstrap() {
  validateRequiredEnv();
  await ensureTmpDir();
  app.listen(PORT, "0.0.0.0", () => logInfo("server_started", { port: PORT }));
}

bootstrap().catch((error) => {
  logError("server_boot_failed", { message: error.message });
  process.exit(1);
});
root@ubuntu-8gb-nbg1-1:~#






























