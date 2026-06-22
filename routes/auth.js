const express = require("express");
const router = express.Router();
const { authenticate, requireAdmin } = require("../middleware/auth");
const { register, login, me, users, forceLogout, logout, selfUnlock } = require("../controllers/authController");

router.post("/register",     register);
router.post("/login",        login);
router.get("/me",            authenticate, me);
router.get("/users",         authenticate, users);

// ✅ NEW: called by frontend logout button — sets isOnline=false immediately
router.post("/logout",       authenticate, logout);

// ✅ NEW: called when user is stuck with isOnline=true — no admin needed
router.post("/self-unlock",  selfUnlock);

// Admin only
router.post("/force-logout", authenticate, requireAdmin, forceLogout);

module.exports = router;