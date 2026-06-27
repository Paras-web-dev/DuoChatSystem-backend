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
// ✅ NEW: Telegram + Ntfy notifiers
const { sendUserOnlineNotification, sendNewMessageNotification } = require("./utils/ntfyNotifier");
const { sendUserOnlineTelegram, sendNewMessageTelegram } = require("./utils/telegramNotifier");
const Message = require("./models/Message");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);

// ✅ FIX: use CLIENT_URL from .env instead of hardcoded value
const clientUrl = process.env.CLIENT_URL || "https://networkerror.xyz";
const PORT = process.env.PORT || 5000;

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// ✅ FIX: health check now shows real MongoDB connection status
app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown";
  res.json({
    status: dbState === 1 ? "ok" : "degraded",
    db: dbStatus,
    onlineUsers: onlineUsers.size,
    time: new Date(),
  });
});

const onlineUsers = new Map();

// ✅ NEW: rate limiter for socket messages
// tracks last message time per userId — max 1 message per 500ms
const messageCooldowns = new Map();
const MESSAGE_COOLDOWN_MS = 500;

// ✅ NEW: helper to check if admin is currently online
const isAdminOnline = () =>
  [...onlineUsers.values()].some((u) => u.role === "admin");

io.use(authenticateSocket);

io.on("connect_error", (err) => {
  console.error("Socket connect_error:", err.message);
});

io.on("connection", async (socket) => {
  const { userId, username, role } = socket.user;

  const alreadyConnected = [...onlineUsers.values()].some((user) => user.userId === userId);
  if (alreadyConnected) {
    socket.emit("force_disconnect", {
      message: `${role === "admin" ? "Admin" : "User"} is already logged in on another device. Please logout there first.`,
    });
    socket.disconnect(true);
    return;
  }

  onlineUsers.set(socket.id, { userId, username, role });
  console.log(`${username} (${role}) connected | Total online: ${onlineUsers.size}`);

  const existingUser = await User.findById(userId).select("isOnline");
  const wasOffline = !existingUser || existingUser.isOnline === false;

  await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
  io.emit("user_status", { userId, username, role, isOnline: true });

  if (role !== "admin" && wasOffline) {
    sendOnlineNotification(username).catch(console.error);
    // ✅ NEW: send Ntfy + Telegram if admin is offline
    if (!isAdminOnline()) {
      sendUserOnlineNotification(username).catch(console.error);
      sendUserOnlineTelegram(username).catch(console.error);
    }
  }

  socket.on("send_message", async (data) => {
    try {
      // ✅ NEW: rate limiting — ignore if sending too fast
      const now = Date.now();
      const lastSent = messageCooldowns.get(userId) || 0;
      if (now - lastSent < MESSAGE_COOLDOWN_MS) {
        return socket.emit("error", { message: "You are sending messages too fast. Please slow down." });
      }
      messageCooldowns.set(userId, now);

      const { content, type = "text", imageUrl = null } = data || {};
      if (!content && !imageUrl) {
        return socket.emit("error", { message: "Message content is required" });
      }

      const message = await Message.create({
        sender: userId,
        senderName: username,
        senderRole: role,
        content,
        type,
        imageUrl,
        timestamp: new Date(),
        hiddenFromUser: false,
      });

      const populated = await message.populate("sender", "username avatar role");
      io.emit("receive_message", {
        _id: populated._id,
        sender: populated.sender._id,
        senderName: username,
        senderRole: role,
        senderAvatar: populated.sender.avatar,
        content: populated.content,
        type: populated.type,
        imageUrl: populated.imageUrl,
        timestamp: populated.timestamp,
        isRead: populated.isRead,
        hiddenFromUser: populated.hiddenFromUser,
      });

      // ✅ NEW: send Ntfy + Telegram if user sends message and admin is offline
      if (role !== "admin" && !isAdminOnline()) {
        sendNewMessageNotification(username, content, type).catch(console.error);
        sendNewMessageTelegram(username, content, type).catch(console.error);
      }

    } catch (err) {
      console.error("send_message error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("typing_start", () => {
    socket.broadcast.emit("typing_start", { username, role });
  });

  socket.on("typing_stop", () => {
    socket.broadcast.emit("typing_stop", { username });
  });

  socket.on("mark_read", async () => {
    await Message.updateMany({ isRead: false, sender: { $ne: userId } }, { isRead: true });
    io.emit("messages_read");
  });

  socket.on("ngt_triggered", () => {
    console.log(`NGT triggered by ${username}`);
    socket.emit("ngt_redirect");
  });

  socket.on("disconnect", async (reason) => {
    console.log(`${username} disconnected (${reason})`);
    onlineUsers.delete(socket.id);

    // ✅ NEW: clean up rate limiter entry on disconnect
    messageCooldowns.delete(userId);

    const stillOnline = [...onlineUsers.values()].some((user) => user.userId === userId);
    if (stillOnline) return;

    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
    io.emit("user_status", { userId, username, role, isOnline: false });

    if (role !== "admin") {
      await Message.updateMany({ hiddenFromUser: { $ne: true } }, { hiddenFromUser: true });
      for (const [socketId, info] of onlineUsers) {
        if (info.role !== "admin") {
          io.to(socketId).emit("chat_cleared", { reason: "User logged out - chat cleared for users" });
        }
      }
    }
  });
});

const start = async () => {
  try {
    console.log("MONGO_URI RAW =", JSON.stringify(process.env.MONGO_URI));
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    await User.updateMany({}, { isOnline: false });
    console.log("All users reset to offline on startup");

    server.listen(PORT, () => {
      console.log(`PrivChat server running on port ${PORT}`);
      console.log(`Client URL: ${clientUrl}`);
      console.log(`Telegram configured: ${Boolean(process.env.TELEGRAM_BOT_TOKEN)}`);
      console.log(`Ntfy topic: ${process.env.NTFY_TOPIC || "Privchat-admin-9x7k2m"}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed. Server not started:", err);
    process.exit(1);
  }
};

start();