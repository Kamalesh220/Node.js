
const express = require("express");
const router = express.Router();

const { register, updatePassword } = require("../customerController/authController");

router.post("/register", register);
router.put("/changePassword", updatePassword);

module.exports = router;
