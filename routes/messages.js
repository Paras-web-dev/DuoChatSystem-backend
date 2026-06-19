const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const { authenticate, requireAdmin } = require("../middleware/auth");

// ── GET /api/messages ─────────────────────────────────────────────────────
router.get("/", authenticate, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { hiddenFromUser: { $ne: true } };
    const messages = await Message.find(query)
      .sort({ timestamp: 1 })
      .populate("sender", "username avatar role");

    res.json(messages);
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
