// -------------------------------------------------------------------------
// Media routes.
//   POST   /users/me/avatar   set avatar (data URL)
//   DELETE /users/me/avatar   remove avatar
//   POST   /media/images      upload a post image -> { id, url, width, height }
//   DELETE /media/images/:id  delete one of my images that is not yet on a post
//
// The whole API is JSON (no multipart middleware). Clients send a data URL
// (data:image/png;base64,....). We decode, check the real bytes against an
// allow-list (magic numbers, not the declared type), strip location/device
// metadata, store via the storage abstraction (local/S3) under a key we
// generate, and keep only the public URL.
//
// The larger body allowance for these exact paths is configured centrally in
// server/index.js (UPLOAD_PATHS) because Express body parsers run in
// registration order.
// -------------------------------------------------------------------------
import storage from "./storage.js";
import { logger } from "./logger.js";

const DATA_URL_RE = /^data:(image\/[a-zA-Z.+-]+);base64,([A-Za-z0-9+/=]+)$/;
const MAX_DIMENSION = 12000;
const DAILY_UPLOAD_LIMIT = 40;

// Decode + validate + sanitise one data URL. Returns { ok, error | buffer, mimeType, ext, size }.
export function prepareImage(dataUrl) {
  const match = String(dataUrl || "").match(DATA_URL_RE);
  if (!match) return { ok: false, error: "invalid_image" };
  const raw = Buffer.from(match[2], "base64");
  if (!raw.length) return { ok: false, error: "empty_file" };
  // The declared type and any file name are ignored: the real bytes decide.
  const mimeType = storage.sniffImageType(raw);
  if (!mimeType) return { ok: false, error: "unsupported_image" };
  const check = storage.validateImage({ mimeType, size: raw.length, buffer: raw });
  if (!check.ok) return check;
  const buffer = storage.stripMetadata(mimeType, raw);
  if (!buffer) return { ok: false, error: "invalid_image" };
  const size = storage.imageSize(mimeType, buffer);
  if (size && (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION || !size.width || !size.height))
    return { ok: false, error: "image_dimensions_unsupported" };
  return { ok: true, buffer, mimeType, ext: check.ext, size };
}

export function registerMediaRoutes(app, deps) {
  const { User, MediaAsset, Op, auth, requireVerified, fail, clean, audit } = deps;

  app.post("/api/v1/users/me/avatar", auth, async (req, res, next) => {
    try {
      const img = prepareImage(req.body?.image);
      if (!img.ok) return fail(res, 400, img.error);
      const stored = await storage.storeObject({
        buffer: img.buffer,
        mimeType: img.mimeType,
        prefix: `avatars/${req.user.id}`,
        ext: img.ext,
      });
      const previous = req.user.avatarUrl;
      await req.user.update({ avatarUrl: stored.url });
      if (previous && previous !== stored.url) {
        const prevKey = storage.keyFromUrl(previous);
        if (prevKey) storage.deleteObject(prevKey).catch(() => {});
      }
      await audit(req, "update_avatar", "user", req.user.id);
      res.json({ avatarUrl: stored.url });
    } catch (e) {
      logger.error("media.avatar_failed", { error: String(e) });
      next(e);
    }
  });

  app.delete("/api/v1/users/me/avatar", auth, async (req, res, next) => {
    try {
      const previous = req.user.avatarUrl;
      await req.user.update({ avatarUrl: "" });
      if (previous) {
        const key = storage.keyFromUrl(previous);
        if (key) storage.deleteObject(key).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // Post images are uploaded first, then referenced by id in POST /posts.
  app.post("/api/v1/media/images", auth, requireVerified, async (req, res, next) => {
    try {
      const today = await MediaAsset.count({
        where: { UserId: req.user.id, createdAt: { [Op.gt]: new Date(Date.now() - 86400_000) } },
      });
      if (today >= DAILY_UPLOAD_LIMIT) return fail(res, 429, "upload_limit_reached");
      const img = prepareImage(req.body?.image);
      if (!img.ok) return fail(res, 400, img.error);
      const stored = await storage.storeObject({
        buffer: img.buffer,
        mimeType: img.mimeType,
        prefix: `posts/${req.user.id}`,
        ext: img.ext,
      });
      const asset = await MediaAsset.create({
        UserId: req.user.id,
        purpose: "post_image",
        storageKey: stored.key,
        url: stored.url,
        mimeType: img.mimeType,
        sizeBytes: img.buffer.length,
        width: img.size?.width || null,
        height: img.size?.height || null,
        alt: clean(req.body?.alt, 300),
      });
      res.status(201).json({
        id: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      });
    } catch (e) {
      logger.error("media.image_failed", { error: String(e) });
      next(e);
    }
  });

  app.delete("/api/v1/media/images/:id", auth, async (req, res, next) => {
    try {
      const asset = await MediaAsset.findOne({ where: { id: req.params.id, UserId: req.user.id } });
      if (!asset) return fail(res, 404, "not_found");
      if (asset.PostId) return fail(res, 409, "image_attached_to_post");
      await asset.destroy();
      storage.deleteObject(asset.storageKey).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}

// Remove stored objects for assets (used by post deletion and housekeeping).
export async function destroyAssets(assets) {
  for (const a of assets) {
    try {
      await storage.deleteObject(a.storageKey);
    } catch (err) {
      logger.warn("media.delete_object_failed", { key: a.storageKey, error: String(err) });
    }
    await a.destroy();
  }
}

export default { registerMediaRoutes, prepareImage, destroyAssets };
