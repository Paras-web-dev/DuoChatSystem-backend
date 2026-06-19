const jwt = require("jsonwebtoken");
const User = require("../models/User");

const normalizeDecoded = (decoded) => {
  const id = decoded.id || decoded.userId;
  return {
    id,
    userId: id,
    _id: id,
    username: decoded.username,
    role: decoded.role,
  };
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = normalizeDecoded(jwt.verify(token, process.env.JWT_SECRET));
    if (!decoded.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = await User.findById(decoded.id).select("username role");
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = {
      ...decoded,
      username: user.username,
      role: user.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));

    const decoded = normalizeDecoded(jwt.verify(token, process.env.JWT_SECRET));
    if (!decoded.id) return next(new Error("Invalid token payload"));

    const user = await User.findById(decoded.id).select("username role avatar");
    if (!user) return next(new Error("User not found"));

    socket.user = {
      id: user._id.toString(),
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      avatar: user.avatar,
    };
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
};

module.exports = { authenticate, requireAdmin, authenticateSocket };
