const crypto = require("crypto");

const strip0x = (value) => String(value || "").replace(/^0x/i, "");

const normalizeHash = (value) => {
  const hex = strip0x(value).toLowerCase();

  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`Invalid hash: ${value}`);
  }

  return hex;
};

const sha256Hex = (buffer) => {
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const hashPair = (leftHash, rightHash) => {
  const left = Buffer.from(normalizeHash(leftHash), "hex");
  const right = Buffer.from(normalizeHash(rightHash), "hex");

  const ordered = Buffer.compare(left, right) <= 0
    ? [left, right]
    : [right, left];

  return sha256Hex(Buffer.concat(ordered));
};

const buildMerkleTree = (hashArray) => {
  if (!Array.isArray(hashArray) || hashArray.length === 0) {
    throw new Error("No segment hashes provided");
  }

  const layers = [hashArray.map(normalizeHash)];

  while (layers[layers.length - 1].length > 1) {
    const currentLayer = layers[layers.length - 1];
    const nextLayer = [];

    for (let index = 0; index < currentLayer.length; index += 2) {
      const left = currentLayer[index];
      const right = currentLayer[index + 1] || left;
      nextLayer.push(hashPair(left, right));
    }

    layers.push(nextLayer);
  }

  return {
    root: `0x${layers[layers.length - 1][0]}`,
    layers: layers.map((layer) => layer.map((hash) => `0x${hash}`)),
  };
};

const getProof = (tree, leafHash, leafIndex) => {
  if (!tree || !Array.isArray(tree.layers)) {
    throw new Error("Invalid Merkle tree");
  }

  let index = Number(leafIndex);
  const proof = [];

  for (let layerIndex = 0; layerIndex < tree.layers.length - 1; layerIndex += 1) {
    const layer = tree.layers[layerIndex].map(normalizeHash);
    const pairIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = layer[pairIndex] || layer[index];

    proof.push(`0x${sibling}`);
    index = Math.floor(index / 2);
  }

  return proof;
};

const verifyProof = (proof, leafHash, root) => {
  if (!Array.isArray(proof)) return false;

  let computedHash = normalizeHash(leafHash);

  for (const siblingHash of proof) {
    computedHash = hashPair(computedHash, siblingHash);
  }

  return computedHash === normalizeHash(root);
};

module.exports = {
  buildMerkleTree,
  getProof,
  verifyProof,
};