/**
 * Wiku Radius - Main Entry Point
 *
 * Open Source RADIUS Server with Modern Dashboard
 * By wiku.my.id
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import logger from "./utils/logger.js";
import { getDatabase } from "./plugins/sqlite.js";
import RadiusServer from "./core/RadiusServer.js";
import Dashboard from "./core/Dashboard.js";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
  authPort: parseInt(process.env.RADIUS_AUTH_PORT) || 1812,
  acctPort: parseInt(process.env.RADIUS_ACCT_PORT) || 1813,
  dashboardPort: parseInt(process.env.DASHBOARD_PORT) || 3000,
  databasePath: process.env.DATABASE_PATH || "./data/wiku-radius.db",
  jwtSecret: process.env.JWT_SECRET || "wiku-radius-jwt-secret",
};

// ASCII Art Banner
const banner = `
╦ ╦╦╦╔═╦ ╦  ╦═╗╔═╗╔╦╗╦╦ ╦╔═╗
║║║║╠╩╗║ ║  ╠╦╝╠═╣ ║║║║ ║╚═╗
╚╩╝╩╩ ╩╚═╝  ╩╚═╩ ╩═╩╝╩╚═╝╚═╝

Open Source RADIUS Server v1.0.0
By wiku.my.id
`;

async function main() {
  console.log(banner);

  try {
    // Initialize database
    logger.info("Initializing database...");
    const database = getDatabase(config.databasePath);

    // Initialize RADIUS server
    logger.info("Initializing RADIUS server...");
    const radiusServer = new RadiusServer(database, {
      authPort: config.authPort,
      acctPort: config.acctPort,
    });

    // Initialize Dashboard
    logger.info("Initializing Dashboard...");
    const dashboard = new Dashboard(database, radiusServer, {
      port: config.dashboardPort,
      jwtSecret: config.jwtSecret,
    });

    // Start all servers
    await radiusServer.start();
    await dashboard.start();

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   WIKU RADIUS STARTED                     ║
╠═══════════════════════════════════════════════════════════╣
║  🔐 Authentication: Port ${config.authPort.toString().padEnd(30)}║
║  📊 Accounting:     Port ${config.acctPort.toString().padEnd(30)}║
║  🖥️  Dashboard:      http://localhost:${config.dashboardPort.toString().padEnd(20)}║
╠═══════════════════════════════════════════════════════════╣
║  📝 Default Login: admin / admin123                       ║
╚═══════════════════════════════════════════════════════════╝
`);

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      await dashboard.stop();
      await radiusServer.stop();
      database.close();

      logger.info("Goodbye! 👋");
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start Wiku Radius:", error);
    process.exit(1);
  }
}

// Run
main();
