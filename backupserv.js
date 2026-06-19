require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const uploadRoutes = require("./routes/upload");
const { authenticateSocket } = require("./middleware/auth");
const { sendOnlineNotification } = require("./utils/mailer");
const Message = require("./models/Message");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date() }));

// ── MongoDB ─────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ── Socket.io ───────────────────────────────────────────────────────────────
const onlineUsers = new Map(); // socketId → { userId, username, role }

io.use(authenticateSocket);

io.on("connection", async (socket) => {
  const { userId, username, role } = socket.user;
  onlineUsers.set(socket.id, { userId, username, role });

  console.log(`🟢 ${username} (${role}) connected`);

  // Check previous online status; send notification only when transitioning from offline → online
  const existingUser = await User.findById(userId).select("isOnline");
  const wasOffline = !existingUser || existingUser.isOnline === false;

  // Update user status to online
  await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

  // Broadcast online status to all clients
  io.emit("user_status", { userId, username, role, isOnline: true });

  // Send email notification to admin when non-admin comes online (only if previously offline)
  if (role !== "admin" && wasOffline) {
    sendOnlineNotification(username).catch(console.error);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  socket.on("send_message", async (data) => {
    try {
      const { content, type = "text", imageUrl = null } = data;

      const message = await Message.create({
        sender: userId,
        senderName: username,
        senderRole: role,
        content,
        type,
        imageUrl,
        timestamp: new Date(),
      });

      const populated = await message.populate("sender", "username avatar");

      io.emit("receive_message", {
        _id: populated._id,
        sender: populated.sender._id,
        senderName: username,
        senderRole: role,
        senderAvatar: populated.sender.avatar,
        content,
        type,
        imageUrl,
        timestamp: populated.timestamp,
        isRead: false,
      });
    } catch (err) {
      console.error("send_message error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // ── Typing indicator ──────────────────────────────────────────────────────
  socket.on("typing_start", async () => {
    socket.broadcast.emit("typing_start", { username, role });
  });

  socket.on("typing_stop", () => {
    socket.broadcast.emit("typing_stop", { username });
  });

  // ── Message read ──────────────────────────────────────────────────────────
  socket.on("mark_read", async () => {
    await Message.updateMany({ isRead: false, sender: { $ne: userId } }, { isRead: true });
    io.emit("messages_read");
  });

  // ── NGT emergency button ──────────────────────────────────────────────────
  socket.on("ngt_triggered", () => {
    console.log(`🚨 NGT triggered by ${username}`);
    socket.emit("ngt_redirect");
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", async () => {
    console.log(`🔴 ${username} disconnected`);

    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
    io.emit("user_status", { userId, username, role, isOnline: false });

    // When a non-admin user logs out, clear the chat only on non-admin client interfaces.
    // Mark existing messages hidden from users so they will not reload after logout.
    if (role !== "admin") {
      await Message.updateMany({ hiddenFromUser: { $ne: true } }, { hiddenFromUser: true });
      for (const [sockId, info] of onlineUsers) {
        if (info.role !== "admin") {
          io.to(sockId).emit("chat_cleared", { reason: "User logged out — chat cleared for users" });
        }
      }
      console.log("🗑️  Chat cleared on user interfaces (admin retains DB messages)");
    }

    // Finally remove this socket from the online map
    onlineUsers.delete(socket.id);
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 PrivChat server running on port ${PORT}`);
  console.log(`   Client URL: ${process.env.CLIENT_URL}`);
});
