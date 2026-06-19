const express = require("express");
const router = express.Router();
const { authenticate, requireAdmin } = require("../middleware/auth");
const { register, login, me, users, forceLogout } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, me);
router.get("/users", authenticate, users);
router.post("/force-logout", authenticate, requireAdmin, forceLogout);

module.exports = router;
