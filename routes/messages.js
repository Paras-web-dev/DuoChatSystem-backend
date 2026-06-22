const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const { authenticate, requireAdmin } = require("../middleware/auth");

// ── GET /api/messages ─────────────────────────────────────────────────────
// ✅ FIX: added limit + pagination so it doesn't load ALL messages at once
// Usage:
//   /api/messages          → last 50 messages
//   /api/messages?limit=100  → last 100 messages
//   /api/messages?before=<timestamp>  → 50 messages before that timestamp (for loading older)
router.get("/", authenticate, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { hiddenFromUser: { $ne: true } };

    // ✅ NEW: support loading messages before a certain timestamp (for "load older" feature)
    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (!isNaN(beforeDate.getTime())) {
        query.timestamp = { $lt: beforeDate };
      }
    }

    // ✅ NEW: limit how many messages come back — default 50, max 200
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = isNaN(requestedLimit)
      ? 50
      : Math.min(requestedLimit, 200);

    // ✅ FIX: sort descending to get the LATEST messages,
    // then reverse so frontend gets them oldest-first (correct chat order)
    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate("sender", "username avatar role");

    // Reverse so oldest is first (chat displays top to bottom)
    res.json(messages.reverse());
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /api/messages ──────────────────────────────────────────────────
// Admin-only: manually clear chat
router.delete("/", authenticate, requireAdmin, async (req, res) => {
  try {
    await Message.deleteMany({});
    res.json({ message: "Chat history cleared" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;