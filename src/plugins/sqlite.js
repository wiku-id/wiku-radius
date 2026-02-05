/**
 * Wiku Radius - SQLite Database Plugin
 *
 * Provides database operations for users, NAS clients, sessions, and accounting
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";

class SQLitePlugin {
  constructor(dbPath = "./data/wiku-radius.db") {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL"); // Better performance
    this.initTables();
    logger.info(`SQLite database initialized at ${dbPath}`);
  }

  /**
   * Initialize database tables
   */
  initTables() {
    // Users table (radcheck equivalent)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        profile TEXT DEFAULT 'default',
        expired_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User attributes table (radreply equivalent)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_attributes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        attribute TEXT NOT NULL,
        op TEXT DEFAULT ':=',
        value TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // NAS clients table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nas_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ip_address TEXT UNIQUE NOT NULL,
        secret TEXT NOT NULL,
        type TEXT DEFAULT 'mikrotik',
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        nas_ip TEXT NOT NULL,
        framed_ip TEXT,
        mac_address TEXT,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME,
        stop_time DATETIME,
        session_time INTEGER DEFAULT 0,
        input_octets INTEGER DEFAULT 0,
        output_octets INTEGER DEFAULT 0,
        input_gigawords INTEGER DEFAULT 0,
        output_gigawords INTEGER DEFAULT 0,
        terminate_cause TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Accounting log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounting (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        session_id TEXT,
        nas_ip TEXT,
        status_type TEXT NOT NULL,
        session_time INTEGER DEFAULT 0,
        input_octets INTEGER DEFAULT 0,
        output_octets INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Profiles table (bandwidth/rate-limit profiles)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        rate_limit TEXT,
        session_timeout INTEGER,
        idle_timeout INTEGER,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Admin users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_nas_ip ON nas_clients(ip_address);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_sid ON sessions(session_id);
    `);

    // Insert default admin if not exists
    const adminExists = this.db
      .prepare("SELECT id FROM admins WHERE username = ?")
      .get("admin");
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync("admin123", 10);
      this.db
        .prepare(
          "INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)",
        )
        .run("admin", hashedPassword, "admin@localhost", "superadmin");
      logger.info("Default admin user created (admin/admin123)");
    }

    // Insert default profile if not exists
    const profileExists = this.db
      .prepare("SELECT id FROM profiles WHERE name = ?")
      .get("default");
    if (!profileExists) {
      this.db
        .prepare("INSERT INTO profiles (name, description) VALUES (?, ?)")
        .run("default", "Default profile with no restrictions");
    }
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Find user by username
   */
  findUser(username) {
    return this.db
      .prepare(
        `
      SELECT * FROM users WHERE username = ? AND is_active = 1
    `,
      )
      .get(username);
  }

  /**
   * Get all users with pagination
   */
  getUsers(page = 1, limit = 20, search = "") {
    const offset = (page - 1) * limit;
    let query = "SELECT * FROM users";
    let countQuery = "SELECT COUNT(*) as total FROM users";
    const params = [];

    if (search) {
      query += " WHERE username LIKE ?";
      countQuery += " WHERE username LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    const users = this.db.prepare(query).all(...params, limit, offset);
    const { total } = this.db
      .prepare(countQuery)
      .get(...(search ? [`%${search}%`] : []));

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create new user
   */
  createUser(username, password, profile = "default", expiredAt = null) {
    try {
      const result = this.db
        .prepare(
          `
        INSERT INTO users (username, password, profile, expired_at)
        VALUES (?, ?, ?, ?)
      `,
        )
        .run(username, password, profile, expiredAt);

      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "Username already exists" };
      }
      throw error;
    }
  }

  /**
   * Update user
   */
  updateUser(id, data) {
    const fields = [];
    const values = [];

    if (data.password !== undefined) {
      fields.push("password = ?");
      values.push(data.password);
    }
    if (data.profile !== undefined) {
      fields.push("profile = ?");
      values.push(data.profile);
    }
    if (data.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(data.is_active ? 1 : 0);
    }
    if (data.expired_at !== undefined) {
      fields.push("expired_at = ?");
      values.push(data.expired_at);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    this.db
      .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
    return { success: true };
  }

  /**
   * Delete user
   */
  deleteUser(id) {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return { success: true };
  }

  // ==================== NAS CLIENT OPERATIONS ====================

  /**
   * Find NAS client by IP
   */
  findNas(ipAddress) {
    return this.db
      .prepare(
        `
      SELECT * FROM nas_clients WHERE ip_address = ? AND is_active = 1
    `,
      )
      .get(ipAddress);
  }

  /**
   * Get all NAS clients
   */
  getNasClients() {
    return this.db
      .prepare("SELECT * FROM nas_clients ORDER BY created_at DESC")
      .all();
  }

  /**
   * Create NAS client
   */
  createNas(name, ipAddress, secret, type = "mikrotik", description = "") {
    try {
      const result = this.db
        .prepare(
          `
        INSERT INTO nas_clients (name, ip_address, secret, type, description)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(name, ipAddress, secret, type, description);

      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "NAS IP already exists" };
      }
      throw error;
    }
  }

  /**
   * Update NAS client
   */
  updateNas(id, data) {
    const fields = [];
    const values = [];

    [
      "name",
      "ip_address",
      "secret",
      "type",
      "description",
      "is_active",
    ].forEach((field) => {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(
          field === "is_active" ? (data[field] ? 1 : 0) : data[field],
        );
      }
    });

    values.push(id);
    this.db
      .prepare(`UPDATE nas_clients SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
    return { success: true };
  }

  /**
   * Delete NAS client
   */
  deleteNas(id) {
    this.db.prepare("DELETE FROM nas_clients WHERE id = ?").run(id);
    return { success: true };
  }

  // ==================== SESSION OPERATIONS ====================

  /**
   * Create session
   */
  createSession(userId, sessionId, nasIp, framedIp = null, macAddress = null) {
    try {
      this.db
        .prepare(
          `
        INSERT INTO sessions (user_id, session_id, nas_ip, framed_ip, mac_address)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(userId, sessionId, nasIp, framedIp, macAddress);
      return { success: true };
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        // Session exists, update it
        this.db
          .prepare(
            `
          UPDATE sessions SET 
            nas_ip = ?, framed_ip = ?, mac_address = ?, 
            start_time = CURRENT_TIMESTAMP, stop_time = NULL
          WHERE session_id = ?
        `,
          )
          .run(nasIp, framedIp, macAddress, sessionId);
      }
      return { success: true };
    }
  }

  /**
   * Update session
   */
  updateSession(sessionId, data) {
    this.db
      .prepare(
        `
      UPDATE sessions SET
        session_time = ?,
        input_octets = ?,
        output_octets = ?,
        input_gigawords = ?,
        output_gigawords = ?,
        update_time = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `,
      )
      .run(
        data.sessionTime || 0,
        data.inputOctets || 0,
        data.outputOctets || 0,
        data.inputGigawords || 0,
        data.outputGigawords || 0,
        sessionId,
      );
    return { success: true };
  }

  /**
   * End session
   */
  endSession(sessionId, data) {
    this.db
      .prepare(
        `
      UPDATE sessions SET
        session_time = ?,
        input_octets = ?,
        output_octets = ?,
        input_gigawords = ?,
        output_gigawords = ?,
        stop_time = CURRENT_TIMESTAMP,
        terminate_cause = ?
      WHERE session_id = ?
    `,
      )
      .run(
        data.sessionTime || 0,
        data.inputOctets || 0,
        data.outputOctets || 0,
        data.inputGigawords || 0,
        data.outputGigawords || 0,
        data.terminateCause || "User-Request",
        sessionId,
      );
    return { success: true };
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    return this.db
      .prepare(
        `
      SELECT s.*, u.username 
      FROM sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.stop_time IS NULL 
      ORDER BY s.start_time DESC
    `,
      )
      .all();
  }

  /**
   * Get session by session_id
   */
  findSession(sessionId) {
    return this.db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId);
  }

  // ==================== ACCOUNTING OPERATIONS ====================

  /**
   * Log accounting record
   */
  logAccounting(data) {
    this.db
      .prepare(
        `
      INSERT INTO accounting (user_id, username, session_id, nas_ip, status_type, session_time, input_octets, output_octets)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        data.userId || null,
        data.username,
        data.sessionId || null,
        data.nasIp,
        data.statusType,
        data.sessionTime || 0,
        data.inputOctets || 0,
        data.outputOctets || 0,
      );
  }

  /**
   * Get accounting records with pagination
   */
  getAccountingLogs(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const logs = this.db
      .prepare(
        `
      SELECT * FROM accounting ORDER BY created_at DESC LIMIT ? OFFSET ?
    `,
      )
      .all(limit, offset);

    const { total } = this.db
      .prepare("SELECT COUNT(*) as total FROM accounting")
      .get();

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==================== PROFILE OPERATIONS ====================

  /**
   * Get all profiles
   */
  getProfiles() {
    return this.db.prepare("SELECT * FROM profiles ORDER BY name").all();
  }

  /**
   * Create profile
   */
  createProfile(
    name,
    rateLimit = null,
    sessionTimeout = null,
    idleTimeout = null,
    description = "",
  ) {
    try {
      const result = this.db
        .prepare(
          `
        INSERT INTO profiles (name, rate_limit, session_timeout, idle_timeout, description)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(name, rateLimit, sessionTimeout, idleTimeout, description);

      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return { success: false, error: "Profile name already exists" };
      }
      throw error;
    }
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Find admin by username
   */
  findAdmin(username) {
    return this.db
      .prepare("SELECT * FROM admins WHERE username = ?")
      .get(username);
  }

  /**
   * Verify admin password
   */
  verifyAdmin(username, password) {
    const admin = this.findAdmin(username);
    if (!admin) return null;

    if (bcrypt.compareSync(password, admin.password)) {
      const { password: _, ...adminWithoutPassword } = admin;
      return adminWithoutPassword;
    }
    return null;
  }

  // ==================== STATISTICS ====================

  /**
   * Get dashboard statistics
   */
  getStats() {
    const totalUsers = this.db
      .prepare("SELECT COUNT(*) as count FROM users")
      .get().count;
    const activeUsers = this.db
      .prepare("SELECT COUNT(*) as count FROM users WHERE is_active = 1")
      .get().count;
    const totalNas = this.db
      .prepare("SELECT COUNT(*) as count FROM nas_clients")
      .get().count;
    const activeSessions = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE stop_time IS NULL")
      .get().count;

    // Get bandwidth stats for today
    const today = new Date().toISOString().split("T")[0];
    const bandwidthToday = this.db
      .prepare(
        `
      SELECT 
        COALESCE(SUM(input_octets), 0) as download,
        COALESCE(SUM(output_octets), 0) as upload
      FROM accounting 
      WHERE DATE(created_at) = ?
    `,
      )
      .get(today);

    return {
      totalUsers,
      activeUsers,
      totalNas,
      activeSessions,
      bandwidthToday: {
        download: bandwidthToday.download,
        upload: bandwidthToday.upload,
      },
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

export function getDatabase(dbPath) {
  if (!instance) {
    instance = new SQLitePlugin(dbPath);
  }
  return instance;
}

export default SQLitePlugin;
