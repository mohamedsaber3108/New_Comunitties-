// -------------------------------------------------------------------------
// File/media storage abstraction.
//
// Drivers:
//   - "local" (dev): writes under MEDIA_ROOT, served by Express at
//     MEDIA_PUBLIC_PATH. Not durable across multiple instances.
//   - "s3": uploads to an S3 bucket via @aws-sdk/client-s3 (lazy-loaded),
//     returns a public URL (bucket/base-url based).
//
// Security: callers must pass validated content. validateImage() enforces an
// allow-list of image mime types + a max size, and we generate the stored
// key/filename ourselves (never trust the client filename) to avoid path
// traversal and content-type confusion.
// -------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Magic-byte signatures. The declared MIME type is attacker-controlled, so the
// actual bytes must match it (blocks HTML/SVG/script smuggled as "image/png").
const SIGNATURES = {
  "image/png": (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a"),
  "image/webp": (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

export function validateImage({ mimeType, size, buffer }) {
  if (!IMAGE_TYPES[mimeType])
    return { ok: false, error: "unsupported_file_type" };
  if (!size || size <= 0) return { ok: false, error: "empty_file" };
  if (size > config.storage.maxUploadBytes)
    return { ok: false, error: "file_too_large" };
  if (!buffer || !SIGNATURES[mimeType](buffer))
    return { ok: false, error: "invalid_image" };
  return { ok: true, ext: IMAGE_TYPES[mimeType] };
}

function generateKey(prefix, ext) {
  const id = crypto.randomBytes(16).toString("hex");
  const safePrefix = String(prefix || "uploads").replace(/[^a-z0-9/_-]/gi, "");
  return `${safePrefix}/${id}.${ext}`;
}

let s3ClientPromise = null;
async function getS3() {
  if (!s3ClientPromise) {
    s3ClientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) => new S3Client({ region: config.storage.s3Region }),
    );
  }
  return s3ClientPromise;
}

// Store a buffer. Returns { key, url }.
export async function storeObject({ buffer, mimeType, prefix = "uploads", ext }) {
  const key = generateKey(prefix, ext);
  if (config.storage.driver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: config.storage.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const base =
      config.storage.s3PublicBaseUrl ||
      `https://${config.storage.s3Bucket}.s3.${config.storage.s3Region}.amazonaws.com`;
    return { key, url: `${base}/${key}` };
  }

  // local driver
  const abs = path.join(config.storage.localDir, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return { key, url: `${config.storage.localPublicPath}/${key}` };
}

export async function deleteObject(key) {
  if (!key) return;
  if (config.storage.driver === "s3") {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.storage.s3Bucket, Key: key }),
    );
    return;
  }
  const abs = path.join(config.storage.localDir, key);
  fs.rmSync(abs, { force: true });
}

export default { validateImage, storeObject, deleteObject };
