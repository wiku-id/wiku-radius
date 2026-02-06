/**
 * Wiku Radius - Dashboard Server
 *
 * Express-based web dashboard for managing RADIUS server
 */

import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { dashboardLogger as logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Dashboard Server Class
 */
class Dashboard {
  constructor(database, radiusServer, options = {}) {
    this.db = database;
    this.radiusServer = radiusServer;
    this.options = {
      port: options.port || 3000,
      jwtSecret: options.jwtSecret || "wiku-radius-jwt-secret",
      ...options,
    };

    this.app = express();
    this.server = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, "../../public")));
  }

  /**
   * JWT Authentication middleware
   */
  authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, this.options.jwtSecret);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    const router = express.Router();

    // ==================== AUTH ROUTES ====================

    router.post("/auth/login", (req, res) => {
      const { username, password } = req.body;

      const admin = this.db.verifyAdmin(username, password);

      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        this.options.jwtSecret,
        { expiresIn: "24h" },
      );

      res.json({ token, user: admin });
    });

    router.get("/auth/me", this.authMiddleware.bind(this), (req, res) => {
      res.json({ user: req.user });
    });

    // ==================== DASHBOARD ROUTES ====================

    router.get(
      "/dashboard/stats",
      this.authMiddleware.bind(this),
      (req, res) => {
        try {
          const stats = this.db.getStats();
          const serverStatus = this.radiusServer.getStatus();

          res.json({
            ...stats,
            server: serverStatus,
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // ==================== USER ROUTES ====================

    router.get("/users", this.authMiddleware.bind(this), (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || "";

        const result = this.db.getUsers(page, limit, search);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get single user by ID
    router.get("/users/:id", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { id } = req.params;
        const user = this.db.getUserById(id);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({ user });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/users", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { username, password, profile, expired_at } = req.body;

        if (!username || !password) {
          return res
            .status(400)
            .json({ error: "Username and password required" });
        }

        const result = this.db.createUser(
          username,
          password,
          profile,
          expired_at,
        );

        if (result.success) {
          logger.info(`User created: ${username}`);
          res.status(201).json({ id: result.id, message: "User created" });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.put("/users/:id", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { id } = req.params;
        const result = this.db.updateUser(id, req.body);

        if (result.success) {
          logger.info(`User updated: ID ${id}`);
          res.json({ message: "User updated" });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.delete("/users/:id", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { id } = req.params;
        this.db.deleteUser(id);
        logger.info(`User deleted: ID ${id}`);
        res.json({ message: "User deleted" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== NAS ROUTES ====================

    router.get("/nas", this.authMiddleware.bind(this), (req, res) => {
      try {
        const clients = this.db.getNasClients();
        res.json({ clients });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/nas", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { name, ip_address, secret, type, description } = req.body;

        if (!name || !ip_address || !secret) {
          return res
            .status(400)
            .json({ error: "Name, IP address, and secret required" });
        }

        const result = this.db.createNas(
          name,
          ip_address,
          secret,
          type,
          description,
        );

        if (result.success) {
          logger.info(`NAS created: ${name} (${ip_address})`);
          res.status(201).json({ id: result.id, message: "NAS created" });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.put("/nas/:id", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { id } = req.params;
        const result = this.db.updateNas(id, req.body);

        if (result.success) {
          logger.info(`NAS updated: ID ${id}`);
          res.json({ message: "NAS updated" });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.delete("/nas/:id", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { id } = req.params;
        this.db.deleteNas(id);
        logger.info(`NAS deleted: ID ${id}`);
        res.json({ message: "NAS deleted" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== SESSION ROUTES ====================

    router.get("/sessions", this.authMiddleware.bind(this), (req, res) => {
      try {
        const sessions = this.db.getActiveSessions();
        res.json({ sessions });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== ACCOUNTING ROUTES ====================

    router.get("/accounting", this.authMiddleware.bind(this), (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        const result = this.db.getAccountingLogs(page, limit);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== PROFILE ROUTES ====================

    router.get("/profiles", this.authMiddleware.bind(this), (req, res) => {
      try {
        const profiles = this.db.getProfiles();
        res.json({ profiles });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/profiles", this.authMiddleware.bind(this), (req, res) => {
      try {
        const { name, rate_limit, session_timeout, idle_timeout, description } =
          req.body;

        if (!name) {
          return res.status(400).json({ error: "Profile name required" });
        }

        const result = this.db.createProfile(
          name,
          rate_limit,
          session_timeout,
          idle_timeout,
          description,
        );

        if (result.success) {
          logger.info(`Profile created: ${name}`);
          res.status(201).json({ id: result.id, message: "Profile created" });
        } else {
          res.status(400).json({ error: result.error });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== HEALTH CHECK ====================

    router.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      });
    });

    // Mount API routes
    this.app.use("/api", router);

    // Serve SPA for all other routes
    this.app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../../public/index.html"));
    });
  }

  /**
   * Start dashboard server
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, () => {
        logger.info(
          `🖥️  Dashboard server running at http://localhost:${this.options.port}`,
        );
        resolve();
      });

      this.server.on("error", (err) => {
        logger.error("Dashboard server error:", err);
        reject(err);
      });
    });
  }

  /**
   * Stop dashboard server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("Dashboard server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default Dashboard;
