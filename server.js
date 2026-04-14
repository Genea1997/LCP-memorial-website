require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT) || 3000;
const uploadsDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "lcp-memorial.db");
const adminKey = process.env.ADMIN_KEY;

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    donor_email TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created',
    gateway_order_id TEXT,
    gateway_payment_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caption TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    display_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS roadmap_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL,
    title TEXT NOT NULL,
    copy TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
`);

const notificationCount = db.prepare("SELECT COUNT(*) AS count FROM notifications").get().count;
if (!notificationCount) {
  const rows = [
    ["Important", "Quarterly donor report will be published on April 30.", "Apr 30"],
    ["Upcoming Event", "Free health outreach camp scheduled for May 12.", "May 12"],
    ["Volunteer Call", "Applications open for the summer education support drive.", "Open Now"],
  ];
  const insert = db.prepare(
    "INSERT INTO notifications (type, text, display_date) VALUES (?, ?, ?)"
  );
  const seed = db.transaction(() => {
    rows.forEach((row) => insert.run(...row));
  });
  seed();
}

const roadmapCount = db.prepare("SELECT COUNT(*) AS count FROM roadmap_items").get().count;
if (!roadmapCount) {
  const rows = [
    ["Phase 01", "Expand school support", "Add 50 student scholarship slots with books and digital kits.", 1],
    ["Phase 02", "Launch village health visits", "Monthly mobile support days for screening, medicine, and referrals.", 2],
    ["Phase 03", "Community memorial day", "Annual donor and beneficiary gathering with impact stories and planning.", 3],
  ];
  const insert = db.prepare(
    "INSERT INTO roadmap_items (phase, title, copy, position) VALUES (?, ?, ?, ?)"
  );
  const seed = db.transaction(() => {
    rows.forEach((row) => insert.run(...row));
  });
  seed();
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadsDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const base = path
      .basename(file.originalname || "gallery-image", extension)
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase();
    callback(null, `${Date.now()}-${base}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image uploads are allowed."));
      return;
    }
    callback(null, true);
  },
});

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const requireAdmin = (req, res, next) => {
  if (!adminKey) {
    next();
    return;
  }

  const providedKey = req.header("x-admin-key");
  if (providedKey !== adminKey) {
    res.status(401).json({ error: "Admin authorization required." });
    return;
  }

  next();
};

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/gallery", (_req, res) => {
  const items = db
    .prepare(
      "SELECT id, caption, image_url AS imageUrl, created_at AS createdAt FROM gallery_items ORDER BY id DESC"
    )
    .all();
  res.json(
    items.map((item) => ({
      ...item,
      createdAtLabel: formatDate(item.createdAt),
    }))
  );
});

app.post("/api/gallery", requireAdmin, upload.single("image"), (req, res) => {
  const caption = req.body.caption?.trim();

  if (!caption || !req.file) {
    res.status(400).json({ error: "Caption and image are required." });
    return;
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  const result = db
    .prepare("INSERT INTO gallery_items (caption, image_url) VALUES (?, ?)")
    .run(caption, imageUrl);
  const item = db
    .prepare(
      "SELECT id, caption, image_url AS imageUrl, created_at AS createdAt FROM gallery_items WHERE id = ?"
    )
    .get(result.lastInsertRowid);

  res.status(201).json({
    ...item,
    createdAtLabel: formatDate(item.createdAt),
  });
});

app.delete("/api/gallery/:id", requireAdmin, (req, res) => {
  const item = db
    .prepare("SELECT id, image_url AS imageUrl FROM gallery_items WHERE id = ?")
    .get(req.params.id);

  if (!item) {
    res.status(404).json({ error: "Photo not found." });
    return;
  }

  db.prepare("DELETE FROM gallery_items WHERE id = ?").run(req.params.id);

  const filePath = path.join(__dirname, item.imageUrl.replace(/^\//, ""));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.status(204).end();
});

app.get("/api/notifications", (_req, res) => {
  const items = db
    .prepare(
      "SELECT id, type, text, display_date AS date, created_at AS createdAt FROM notifications ORDER BY id DESC"
    )
    .all();
  res.json(items);
});

app.post("/api/notifications", requireAdmin, (req, res) => {
  const text = req.body.text?.trim();
  const type = req.body.type?.trim() || "Announcement";

  if (!text) {
    res.status(400).json({ error: "Notification text is required." });
    return;
  }

  const displayDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
  const result = db
    .prepare("INSERT INTO notifications (type, text, display_date) VALUES (?, ?, ?)")
    .run(type, text, displayDate);
  const item = db
    .prepare(
      "SELECT id, type, text, display_date AS date, created_at AS createdAt FROM notifications WHERE id = ?"
    )
    .get(result.lastInsertRowid);

  res.status(201).json(item);
});

app.get("/api/roadmap", (_req, res) => {
  const items = db
    .prepare("SELECT id, phase, title, copy FROM roadmap_items ORDER BY position ASC, id ASC")
    .all();
  res.json(items);
});

app.get("/api/donations", (_req, res) => {
  const items = db
    .prepare(
      `SELECT id, donor_name AS donorName, donor_email AS donorEmail, amount, currency, status,
              gateway_order_id AS orderId, gateway_payment_id AS paymentId, created_at AS createdAt
       FROM donations
       ORDER BY id DESC`
    )
    .all();
  res.json(
    items.map((item) => ({
      ...item,
      createdAtLabel: formatDate(item.createdAt),
    }))
  );
});

app.post("/api/donations/create-order", async (req, res) => {
  const name = req.body.name?.trim();
  const email = req.body.email?.trim();
  const amount = Number(req.body.amount);

  if (!name || !email || !Number.isFinite(amount) || amount < 100) {
    res.status(400).json({ error: "Valid donor details and amount are required." });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    res.status(503).json({
      error: "Payment gateway is not configured yet. Add Razorpay keys to the .env file.",
    });
    return;
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const gatewayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: "INR",
        receipt: `lcp-${Date.now()}`,
      }),
    });

    if (!gatewayResponse.ok) {
      const details = await gatewayResponse.text();
      res.status(502).json({
        error: "Unable to create payment order with Razorpay.",
        details,
      });
      return;
    }

    const order = await gatewayResponse.json();
    const result = db
      .prepare(
        `INSERT INTO donations (donor_name, donor_email, amount, currency, status, gateway_order_id)
         VALUES (?, ?, ?, 'INR', 'pending', ?)`
      )
      .run(name, email, amount, order.id);

    res.status(201).json({
      donationId: result.lastInsertRowid,
      key: keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      donorName: name,
      donorEmail: email,
      name: "LCP Memorial",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create payment order.",
      details: error.message,
    });
  }
});

app.post("/api/donations/verify", (req, res) => {
  const donationId = Number(req.body.donationId);
  const orderId = req.body.razorpay_order_id;
  const paymentId = req.body.razorpay_payment_id;
  const signature = req.body.razorpay_signature;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!donationId || !orderId || !paymentId || !signature || !keySecret) {
    res.status(400).json({ error: "Missing payment verification details." });
    return;
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    res.status(400).json({ error: "Payment signature verification failed." });
    return;
  }

  db.prepare(
    `UPDATE donations
     SET status = 'paid', gateway_payment_id = ?
     WHERE id = ? AND gateway_order_id = ?`
  ).run(paymentId, donationId, orderId);

  res.json({ ok: true });
});

app.use(express.static(__dirname));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: error.message || "Server error." });
});

app.listen(port, () => {
  console.log(`LCP Memorial app running on http://localhost:${port}`);
});
