import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { initSocketServer, getIo } from "../socket";
import * as db from "../db";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { storagePut } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust proxy (needed for rate limiting behind reverse proxy)
  app.set("trust proxy", 1);

  // ── Security: Helmet HTTP headers ────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // needed for socket.io
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "wss:", "ws:", "https:"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );

  // ── Security: Rate limiting ───────────────────────────────────────────────────
  // General API: 200 requests per 15 minutes per IP
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
  // Auth endpoints: strict — 10 attempts per 15 minutes per IP
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again in 15 minutes." },
  });
  app.use("/api", generalLimiter);
  app.use("/api/trpc/user.login", authLimiter);
  app.use("/api/trpc/user.register", authLimiter);
  app.use("/api/clear-room", authLimiter);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // ── Security: Limit request body size to prevent DoS ─────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ── Avatar upload endpoint ────────────────────────────────────────────────
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image files are allowed"));
    },
  });

  app.post("/api/upload-avatar", upload.single("file"), async (req, res) => {
    try {
      const username = req.body?.username;
      if (!username) {
        res.json({ success: false, error: "Username required" });
        return;
      }
      if (!req.file) {
        res.json({ success: false, error: "No file uploaded" });
        return;
      }
      const ext = req.file.mimetype.split("/")[1] || "jpg";
      const key = `avatars/${username.toLowerCase()}_${Date.now()}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      // Update the user's avatarUrl in the database
      await db.updateChatUserProfile(username, { avatarUrl: url });
      res.json({ success: true, url });
    } catch (err) {
      console.error("[api/upload-avatar] error:", err);
      res.json({ success: false, error: (err as Error).message });
    }
  });

  // ── PM Media upload endpoint (photos/videos for private chat) ──────────────
  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for videos
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) cb(null, true);
      else cb(new Error("Only image and video files are allowed"));
    },
  });

  app.post("/api/upload-media", mediaUpload.single("file"), async (req, res) => {
    try {
      const sender = req.body?.sender;
      const isSecret = req.body?.isSecret === "true";
      if (!sender) {
        res.json({ success: false, error: "Sender required" });
        return;
      }
      if (!req.file) {
        res.json({ success: false, error: "No file uploaded" });
        return;
      }
      const ext = req.file.mimetype.split("/")[1]?.replace("quicktime", "mov") || "jpg";
      const mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
      // Secret media uses a temp key prefix; in production these could be auto-deleted
      const prefix = isSecret ? "secret-media" : "pm-media";
      const key = `${prefix}/${sender.toLowerCase()}_${Date.now()}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      res.json({ success: true, url, mediaType });
    } catch (err) {
      console.error("[api/upload-media] error:", err);
      res.json({ success: false, error: (err as Error).message });
    }
  });

  // ── Profile video upload endpoint ────────────────────────────────────────
  const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max for 10s video
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image and video files are allowed"));
    },
  });

  app.post("/api/upload-profile-video", videoUpload.single("file"), async (req, res) => {
    try {
      const username = req.body?.username;
      if (!username) { res.json({ success: false, error: "Username required" }); return; }
      if (!req.file) { res.json({ success: false, error: "No file uploaded" }); return; }
      const ext = req.file.mimetype.split("/")[1]?.replace("quicktime", "mov") || "mp4";
      const key = `profile-videos/${username.toLowerCase()}_${Date.now()}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      await db.updateChatUserProfile(username, { profileVideoUrl: url });
      res.json({ success: true, url });
    } catch (err) {
      console.error("[api/upload-profile-video] error:", err);
      res.json({ success: false, error: (err as Error).message });
    }
  });

  // Simple direct clear-room endpoint - no tRPC, no socket, just DB + broadcast
  app.post("/api/clear-room", async (req, res) => {
    try {
      const { token, roomId } = req.body;
      const expectedToken = process.env.SUPER_ADMIN_CLEAR_TOKEN || "ammar_clear_2024";
      if (token !== expectedToken) {
        res.json({ success: false, error: "Unauthorized" });
        return;
      }
      // If a specific roomId is provided, clear that room; otherwise clear default
      let targetRoomId: number;
      if (roomId && typeof roomId === "number") {
        targetRoomId = roomId;
      } else {
        const room = await db.ensureDefaultRoom();
        targetRoomId = room.id;
      }
      await db.clearRoomMessages(targetRoomId);
      // Broadcast to all connected socket clients in this room
      const io = getIo();
      if (io) {
        io.to(`room_${targetRoomId}`).emit("room_cleared");
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/clear-room] error:", err);
      res.json({ success: false, error: (err as Error).message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Initialize Socket.io
  initSocketServer(server);

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    console.log(`[socket] Socket.io server initialized`);
  });
}

startServer().catch(console.error);
