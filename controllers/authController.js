const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeUsername = (username) => String(username || "").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const userResponse = (user) => ({
  id: user._id,
  _id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  isOnline: user.isOnline,
  lastSeen: user.lastSeen,
});

const signToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const register = async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const duplicate = await User.findOne({
      $or: [{ email }, { username: new RegExp(`^${escapeRegex(username)}$`, "i") }],
    });

    if (duplicate) {
      const field = duplicate.email === email ? "email" : "username";
      return res.status(409).json({ message: `A user with this ${field} already exists` });
    }

    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
    const role = email === adminEmail ? "admin" : "user";

    const existingAdmin = await User.findOne({ role: "admin" });
    const existingUser = await User.findOne({ role: "user" });

    if (role === "admin" && existingAdmin) {
      return res.status(409).json({
        message: "Admin account already exists. Only one admin is allowed.",
      });
    }

    if (role === "user" && existingUser) {
      return res.status(409).json({
        message: "User account already exists. Only one user is allowed.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role,
    });

    return res.status(201).json({ user: userResponse(user) });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const identifier = normalizeUsername(req.body.identifier || req.body.email || req.body.username);
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    const user = await User.findOne({
      $or: [
        { email: normalizeEmail(identifier) },
        { username: new RegExp(`^${escapeRegex(identifier)}$`, "i") },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.isOnline) {
      return res.status(409).json({
        message: `${user.role === "admin" ? "Admin" : "User"} "${user.username}" is already logged in on another device. Please logout there first.`,
      });
    }

    return res.json({ token: signToken(user), user: userResponse(user) });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(userResponse(user));
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const users = async (req, res) => {
  try {
    const allUsers = await User.find({}, "username email role avatar isOnline lastSeen");
    return res.json(allUsers);
  } catch (err) {
    console.error("Users error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const forceLogout = async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    const updated = await User.findOneAndUpdate(
      { username: new RegExp(`^${escapeRegex(username)}$`, "i") },
      { isOnline: false, lastSeen: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: `${updated.username} has been force logged out.` });
  } catch (err) {
    console.error("Force-logout error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { register, login, me, users, forceLogout };