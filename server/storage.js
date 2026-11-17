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

// ---- Privacy: strip embedded metadata --------------------------------------
// Phone photos carry EXIF (GPS location, device serials, timestamps). Uploads
// are public, so metadata segments are removed before storage. Pixel data is
// untouched (no re-encoding, no new dependency).
//   JPEG: drop APP1..APP15 (EXIF/XMP/IPTC...) and COM segments; keep APP0
//         (JFIF) and APP14 (Adobe colour transform, needed to decode some
//         CMYK files correctly).
//   PNG : drop eXIf, tEXt, zTXt, iTXt, tIME chunks.
//   WebP: drop EXIF and XMP chunks (and clear the VP8X flags for them).
//   GIF : no metadata of concern; returned as-is.
export function stripMetadata(mimeType, buf) {
  try {
    if (mimeType === "image/jpeg") return stripJpeg(buf);
    if (mimeType === "image/png") return stripPng(buf);
    if (mimeType === "image/webp") return stripWebp(buf);
  } catch {
    // Malformed structure: refuse rather than store something we could not
    // sanitise.
    return null;
  }
  return buf;
}

function stripJpeg(b) {
  const out = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("bad_marker");
    const marker = b[i + 1];
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data + EOI.
      out.push(b.subarray(i));
      return Buffer.concat(out);
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new Error("bad_length");
    const isAppMeta = marker >= 0xe1 && marker <= 0xef && marker !== 0xee;
    if (!(isAppMeta || marker === 0xfe)) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new Error("no_scan");
}

function stripPng(b) {
  const drop = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  const out = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    const len = b.readUInt32BE(i);
    const type = b.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > b.length) throw new Error("bad_chunk");
    if (!drop.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

function stripWebp(b) {
  const chunks = [];
  let i = 12;
  let vp8x = null;
  while (i + 8 <= b.length) {
    const type = b.subarray(i, i + 4).toString("latin1");
    const len = b.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > b.length + 1) throw new Error("bad_chunk");
    const chunk = Buffer.from(b.subarray(i, Math.min(end, b.length)));
    if (type === "VP8X") vp8x = chunk;
    if (type !== "EXIF" && type !== "XMP ") chunks.push(chunk);
    i = end;
  }
  if (vp8x) vp8x[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

// Pixel dimensions from the file header (used for layout without CLS and to
// reject absurd sizes). Returns { width, height } or null.
export function imageSize(mimeType, b) {
  try {
    if (mimeType === "image/png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mimeType === "image/gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mimeType === "image/jpeg") {
      let i = 2;
      while (i < b.length) {
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + len;
      }
      return null;
    }
    if (mimeType === "image/webp") {
      const type = b.subarray(12, 16).toString("latin1");
      if (type === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (type === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      if (type === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
  } catch {}
  return null;
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

// Map a stored public URL back to its storage key (for deletion).
export function keyFromUrl(url) {
  if (!url) return null;
  const local = config.storage.localPublicPath + "/";
  if (url.startsWith(local)) return url.slice(local.length);
  const cdn = config.storage.s3PublicBaseUrl;
  if (cdn && url.startsWith(cdn.replace(/\/$/, "") + "/"))
    return url.slice(cdn.replace(/\/$/, "").length + 1);
  const m = url.match(/\.amazonaws\.com\/(.+)$/);
  return m ? m[1] : null;
}

export default { validateImage, storeObject, deleteObject, stripMetadata, imageSize, keyFromUrl };
