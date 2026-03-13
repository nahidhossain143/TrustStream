const fs = require("fs");
const path = require("path");

const catalogDir = path.join(__dirname, "../../data/catalog");

const ensureCatalogDir = () => {
  fs.mkdirSync(catalogDir, { recursive: true });
};

const getManifestPath = (videoId) => path.join(catalogDir, `${videoId}.json`);

const writeManifest = (videoId, manifest) => {
  ensureCatalogDir();
  fs.writeFileSync(getManifestPath(videoId), JSON.stringify(manifest, null, 2));
  return manifest;
};

const readManifest = (videoId) => {
  try {
    return JSON.parse(fs.readFileSync(getManifestPath(videoId), "utf8"));
  } catch (err) {
    return null;
  }
};

const updateManifest = (videoId, updater) => {
  const current = readManifest(videoId);
  if (!current) return null;

  const next = updater({ ...current });
  return writeManifest(videoId, next);
};

const listManifests = () => {
  ensureCatalogDir();

  return fs
    .readdirSync(catalogDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(catalogDir, file), "utf8"));
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

module.exports = {
  writeManifest,
  readManifest,
  updateManifest,
  listManifests,
};