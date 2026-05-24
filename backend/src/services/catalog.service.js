// -----------------------------------------------------------------
//  backend/src/services/catalog.service.js
//
//  File-based JSON catalog for media manifests (videos + images).
//
//  Each manifest is saved as data/catalog/<id>.json. Manifests use a
//  `kind` discriminator field:
//      kind: "video"  -> video manifest with segments[], chain hashes
//      kind: "image"  -> image manifest with single sha256 + IPFS CID
//
//  For backward compatibility, manifests that don't have a `kind`
//  field on disk are treated as `"video"` when read. New code MUST set
//  `kind` explicitly when writing.
// -----------------------------------------------------------------

const fs = require("fs");
const path = require("path");

// --- Storage location --------------------------------------------
// STORAGE_PATH env wins (used on Render/persistent disk),
// otherwise sibling of backend/ (i.e., backend/data/catalog).
const storageRoot = process.env.STORAGE_PATH || path.join(__dirname, "../../");
const catalogDir = path.join(storageRoot, "data/catalog");

// --- Helpers -----------------------------------------------------

const ensureCatalogDir = () => {
  fs.mkdirSync(catalogDir, { recursive: true });
};

const getManifestPath = (id) => path.join(catalogDir, `${id}.json`);

// Apply a default `kind` for legacy manifests that predate the
// video/image split. Pure metadata; doesn't mutate the file on disk.
const withDefaultKind = (manifest) => {
  if (!manifest) return manifest;
  return { kind: "video", ...manifest };
};

// --- Public API --------------------------------------------------

/**
 * Save a manifest to the catalog.
 * `id` is the videoId or imageId. `manifest.kind` should be set
 * explicitly by the caller ("video" or "image"); if missing, downstream
 * readers will assume "video" for backward compat.
 */
const writeManifest = (id, manifest) => {
  ensureCatalogDir();
  fs.writeFileSync(getManifestPath(id), JSON.stringify(manifest, null, 2));
  return manifest;
};

/**
 * Read a manifest by id. Returns null if not found / unparseable.
 * Sets `kind: "video"` if the on-disk manifest predates the split.
 */
const readManifest = (id) => {
  try {
    const raw = JSON.parse(fs.readFileSync(getManifestPath(id), "utf8"));
    return withDefaultKind(raw);
  } catch (err) {
    return null;
  }
};

/**
 * Atomically update a manifest by reading -> applying updater -> writing.
 * Returns the new manifest, or null if the original was missing.
 */
const updateManifest = (id, updater) => {
  const current = readManifest(id);
  if (!current) return null;

  const next = updater({ ...current });
  return writeManifest(id, next);
};

/**
 * List all manifests, newest first.
 *
 * options:
 *   - kind: "video" | "image" | "all" (default: "all")
 *
 * Examples:
 *   listManifests()                  // all media (mixed feed)
 *   listManifests({ kind: "video" }) // videos only
 *   listManifests({ kind: "image" }) // images only
 */
const listManifests = (options = {}) => {
  ensureCatalogDir();
  const { kind = "all" } = options;

  const all = fs
    .readdirSync(catalogDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        const raw = JSON.parse(
          fs.readFileSync(path.join(catalogDir, file), "utf8")
        );
        return withDefaultKind(raw);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);

  const filtered =
    kind === "all" ? all : all.filter((m) => m.kind === kind);

  return filtered.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

/**
 * Convenience: count manifests by kind.
 * Useful for dashboards / admin home stats.
 */
const countByKind = () => {
  const all = listManifests();
  return {
    total: all.length,
    videos: all.filter((m) => m.kind === "video").length,
    images: all.filter((m) => m.kind === "image").length,
  };
};

/**
 * Delete the on-disk manifest file for an id.
 *
 * IMPORTANT: This is a *local catalog* hygiene operation only. It does
 * NOT delete blockchain records, IPFS pins, or C2PA sidecars. The
 * blockchain record is permanent (immutability requirement).
 *
 * Used internally for cleanup/sync. Do NOT expose this through any HTTP
 * route or admin UI - that would violate the "uploaded content cannot
 * be deleted" guarantee.
 */
const removeManifest = (id) => {
  try {
    fs.unlinkSync(getManifestPath(id));
    return true;
  } catch (err) {
    return false;
  }
};

module.exports = {
  writeManifest,
  readManifest,
  updateManifest,
  listManifests,
  countByKind,
  // Internal/admin only - intentionally not for public deletion paths.
  removeManifest,
};
