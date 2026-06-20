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

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date() }));

const onlineUsers = new Map();

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
  }

  socket.on("send_message", async (data) => {
    try {
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
    });
  } catch (err) {
    console.error("MongoDB connection failed. Server not started:", err);
    process.exit(1);
  }
};

start();
