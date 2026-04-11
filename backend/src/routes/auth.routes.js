const express = require("express");
const crypto = require("crypto");
const router = express.Router();

// ─── Simple hash function (no bcrypt dependency needed) ──
const hashPassword = (password) =>
  crypto.createHash("sha256").update(password + process.env.AUTH_SALT).digest("hex");

// ─── Admin credentials from .env ─────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || hashPassword("truststream2026");

// ─── Simple JWT-like token (signed with secret) ──────────
const generateToken = (username) => {
  const payload = JSON.stringify({ username, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString("base64");
  const secret = process.env.AUTH_SECRET || "truststream-secret-key";
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
};

const verifyToken = (token) => {
  try {
    const [payloadB64, sig] = token.split(".");
    const secret = process.env.AUTH_SECRET || "truststream-secret-key";
    const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
    if (sig !== expected) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

// ─── Middleware ───────────────────────────────────────────
const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.admin = payload;
  next();
};

// ─── Routes ───────────────────────────────────────────────

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const inputHash = hashPassword(password);

  if (username !== ADMIN_USERNAME || inputHash !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = generateToken(username);
  console.log(`🔐 Admin login: ${username}`);

  res.json({
    token,
    username,
    expiresIn: "24h",
  });
});

// GET /api/auth/verify
router.get("/verify", requireAuth, (req, res) => {
  res.json({ valid: true, username: req.admin.username });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

module.exports = { router, requireAuth };