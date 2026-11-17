// -------------------------------------------------------------------------
// Media routes: avatar upload / removal.
//
// The whole API is JSON (no multipart middleware). Clients send a data URL
// (data:image/png;base64,....). We decode, validate the mime type + size
// against the storage policy, store via the storage abstraction (local/S3),
// and persist the resulting public URL on the user. The old avatar object is
// best-effort deleted to avoid orphaned files.
//
// The JSON body limit is raised only for this route group's needs via a
// dedicated parser so the global 80kb limit stays tight elsewhere.
// -------------------------------------------------------------------------
import storage from "./storage.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const DATA_URL_RE = /^data:(image\/[a-zA-Z.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export function registerMediaRoutes(app, deps) {
  const { User, auth, fail, audit } = deps;
  // NOTE: the larger body-size allowance for this exact path is configured
  // centrally in server/index.js (see UPLOAD_PATHS) because Express body
  // parsers run in registration order — a bigger parser registered here
  // would never run if a smaller global one already rejected the request.

  app.post(
    "/api/v1/users/me/avatar",
    auth,
    async (req, res, next) => {
      try {
        const dataUrl = String(req.body?.image || "");
        const match = dataUrl.match(DATA_URL_RE);
        if (!match) return fail(res, 400, "invalid_image");
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        const check = storage.validateImage({ mimeType, size: buffer.length, buffer });
        if (!check.ok) return fail(res, 400, check.error);

        const stored = await storage.storeObject({
          buffer,
          mimeType,
          prefix: `avatars/${req.user.id}`,
          ext: check.ext,
        });

        const previous = req.user.avatarUrl;
        await req.user.update({ avatarUrl: stored.url });

        // Best-effort cleanup of the previous local/S3 object (local only can
        // derive a key from the public path; S3 stores the key as the url tail).
        if (previous && previous !== stored.url) {
          const prevKey = deriveKey(previous);
          if (prevKey) storage.deleteObject(prevKey).catch(() => {});
        }

        await audit(req, "update_avatar", "user", req.user.id);
        res.json({ avatarUrl: stored.url });
      } catch (e) {
        logger.error("media.avatar_failed", { error: String(e) });
        next(e);
      }
    },
  );

  app.delete("/api/v1/users/me/avatar", auth, async (req, res, next) => {
    try {
      const previous = req.user.avatarUrl;
      await req.user.update({ avatarUrl: "" });
      if (previous) {
        const key = deriveKey(previous);
        if (key) storage.deleteObject(key).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}

// Derive the storage key from a stored public URL (local path or S3 url).
function deriveKey(url) {
  if (!url) return null;
  if (url.startsWith(config.storage.localPublicPath + "/"))
    return url.slice(config.storage.localPublicPath.length + 1);
  // S3: take everything after the bucket host.
  const m = url.match(/amazonaws\.com\/(.+)$/) || url.match(/\/avatars\/.+$/);
  if (m) return m[1] || m[0].replace(/^\//, "");
  return null;
}

export default { registerMediaRoutes };
