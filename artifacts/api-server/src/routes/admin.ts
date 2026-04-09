import { Router } from "express";
import {
  createAdminToken,
  isValidAdminTokenAsync,
  revokeAdminToken,
} from "../middleware/adminAuth.js";

const router = Router();

router.post("/admin/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server" });
    return;
  }

  if (!password || password !== adminPassword) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const token = createAdminToken();
  res.json({ token });
});

router.get("/admin/verify", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.json({ valid: false });
    return;
  }
  const token = authHeader.slice(7);
  const valid = await isValidAdminTokenAsync(token);
  res.json({ valid });
});

router.post("/admin/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    revokeAdminToken(authHeader.slice(7));
  }
  res.json({ success: true });
});

export default router;
