const express = require("express");
const router = express.Router();
const {
  login,
  register,
  updatePassword,
  me,
  logout,
} = require("../controllers/auth.controller.js");
const { authMiddleware } = require("../middleware/auth.middleware.js");

router.post("/auth/login", login);

router.post("/auth/register", register);

router.get("/auth/me", authMiddleware, me);

router.post("/auth/password", authMiddleware, updatePassword);

router.post("/auth/logout", authMiddleware, logout);

module.exports = router;
