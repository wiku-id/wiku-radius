/**
 * Wiku Radius - Core RADIUS Server
 *
 * Main RADIUS server handling authentication and accounting
 */

import dgram from "dgram";
import radius from "radius";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";
import AuthHandler from "../handlers/auth.js";
import AcctHandler from "../handlers/acct.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * RADIUS Server Class
 */
class RadiusServer {
  constructor(database, options = {}) {
    this.db = database;
    this.options = {
      authPort: options.authPort || 1812,
      acctPort: options.acctPort || 1813,
      ...options,
    };

    this.authServer = null;
    this.acctServer = null;
    this.authHandler = new AuthHandler(database);
    this.acctHandler = new AcctHandler(database);

    // Load RADIUS dictionaries
    this.loadDictionaries();
  }

  /**
   * Load RADIUS dictionaries
   */
  loadDictionaries() {
    try {
      const dictionaryPath = path.join(__dirname, "../dictionary");

      // Load base dictionary
      radius.add_dictionary(path.join(dictionaryPath, "dictionary"));
      logger.info("Loaded base RADIUS dictionary");

      // Load MikroTik dictionary if exists
      try {
        radius.add_dictionary(path.join(dictionaryPath, "dictionary.mikrotik"));
        logger.info("Loaded MikroTik dictionary");
      } catch (e) {
        logger.debug("MikroTik dictionary not found, skipping");
      }
    } catch (error) {
      logger.warn("Could not load custom dictionaries, using defaults");
    }
  }

  /**
   * Create send response function for a server
   */
  createSendResponse(server) {
    return (response, rinfo) => {
      server.send(
        response,
        0,
        response.length,
        rinfo.port,
        rinfo.address,
        (err) => {
          if (err) {
            logger.error(
              `Error sending response to ${rinfo.address}:${rinfo.port}`,
              { error: err },
            );
          }
        },
      );
    };
  }

  /**
   * Start Authentication Server
   */
  startAuthServer() {
    return new Promise((resolve, reject) => {
      this.authServer = dgram.createSocket("udp4");

      this.authServer.on("message", async (msg, rinfo) => {
        await this.authHandler.handle(
          msg,
          rinfo,
          this.createSendResponse(this.authServer),
        );
      });

      this.authServer.on("error", (err) => {
        logger.error("Auth server error:", err);
        reject(err);
      });

      this.authServer.on("listening", () => {
        const address = this.authServer.address();
        logger.info(
          `🔐 Authentication server listening on ${address.address}:${address.port}`,
        );
        resolve();
      });

      this.authServer.bind(this.options.authPort);
    });
  }

  /**
   * Start Accounting Server
   */
  startAcctServer() {
    return new Promise((resolve, reject) => {
      this.acctServer = dgram.createSocket("udp4");

      this.acctServer.on("message", async (msg, rinfo) => {
        await this.acctHandler.handle(
          msg,
          rinfo,
          this.createSendResponse(this.acctServer),
        );
      });

      this.acctServer.on("error", (err) => {
        logger.error("Accounting server error:", err);
        reject(err);
      });

      this.acctServer.on("listening", () => {
        const address = this.acctServer.address();
        logger.info(
          `📊 Accounting server listening on ${address.address}:${address.port}`,
        );
        resolve();
      });

      this.acctServer.bind(this.options.acctPort);
    });
  }

  /**
   * Start both servers
   */
  async start() {
    logger.info("Starting Wiku Radius Server...");

    try {
      await Promise.all([this.startAuthServer(), this.startAcctServer()]);

      logger.info("✅ Wiku Radius Server started successfully");
      return true;
    } catch (error) {
      logger.error("Failed to start RADIUS server:", error);
      throw error;
    }
  }

  /**
   * Stop both servers
   */
  stop() {
    return new Promise((resolve) => {
      let closed = 0;
      const checkDone = () => {
        closed++;
        if (closed === 2) {
          logger.info("Wiku Radius Server stopped");
          resolve();
        }
      };

      if (this.authServer) {
        this.authServer.close(checkDone);
      } else {
        checkDone();
      }

      if (this.acctServer) {
        this.acctServer.close(checkDone);
      } else {
        checkDone();
      }
    });
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      authServer: this.authServer ? "running" : "stopped",
      acctServer: this.acctServer ? "running" : "stopped",
      authPort: this.options.authPort,
      acctPort: this.options.acctPort,
    };
  }
}

export default RadiusServer;
