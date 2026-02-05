/**
 * Wiku Radius - Accounting Handler
 *
 * Handles RADIUS Accounting-Request packets
 */

import radius from "radius";
import { acctLogger as logger } from "../utils/logger.js";

/**
 * Accounting Handler Class
 */
class AcctHandler {
  constructor(database) {
    this.db = database;
  }

  /**
   * Handle Accounting-Request packet
   * @param {Buffer} msg - Raw packet
   * @param {Object} rinfo - Remote info
   * @param {Function} sendResponse - Function to send response
   */
  async handle(msg, rinfo, sendResponse) {
    try {
      // Find NAS client by IP
      const nas = this.db.findNas(rinfo.address);

      if (!nas) {
        logger.warn(`Unknown NAS client: ${rinfo.address}`);
        return;
      }

      // Decode packet
      const packet = radius.decode({
        packet: msg,
        secret: nas.secret,
      });

      if (packet.code !== "Accounting-Request") {
        logger.debug(
          `Ignoring non-Accounting-Request packet from ${rinfo.address}`,
        );
        return;
      }

      // Extract accounting data
      const statusType = packet.attributes["Acct-Status-Type"];
      const username = packet.attributes["User-Name"];
      const sessionId = packet.attributes["Acct-Session-Id"];
      const framedIpAddress = packet.attributes["Framed-IP-Address"] || "";
      const callingStationId = packet.attributes["Calling-Station-Id"] || "";
      const sessionTime = packet.attributes["Acct-Session-Time"] || 0;
      const inputOctets = packet.attributes["Acct-Input-Octets"] || 0;
      const outputOctets = packet.attributes["Acct-Output-Octets"] || 0;
      const inputGigawords = packet.attributes["Acct-Input-Gigawords"] || 0;
      const outputGigawords = packet.attributes["Acct-Output-Gigawords"] || 0;
      const terminateCause = packet.attributes["Acct-Terminate-Cause"] || "";

      logger.info(
        `Accounting-${statusType} from ${rinfo.address} for user: ${username}`,
      );

      // Find user
      const user = this.db.findUser(username);
      const userId = user ? user.id : null;

      // Handle based on status type
      switch (statusType) {
        case "Start":
          await this.handleStart(
            userId,
            username,
            sessionId,
            rinfo.address,
            framedIpAddress,
            callingStationId,
          );
          break;

        case "Interim-Update":
          await this.handleInterimUpdate(sessionId, {
            sessionTime,
            inputOctets,
            outputOctets,
            inputGigawords,
            outputGigawords,
          });
          break;

        case "Stop":
          await this.handleStop(userId, username, sessionId, rinfo.address, {
            sessionTime,
            inputOctets,
            outputOctets,
            inputGigawords,
            outputGigawords,
            terminateCause,
          });
          break;

        default:
          logger.warn(`Unknown Acct-Status-Type: ${statusType}`);
      }

      // Log accounting record
      this.db.logAccounting({
        userId,
        username,
        sessionId,
        nasIp: rinfo.address,
        statusType,
        sessionTime,
        inputOctets: this.calculateTotalBytes(inputOctets, inputGigawords),
        outputOctets: this.calculateTotalBytes(outputOctets, outputGigawords),
      });

      // Send Accounting-Response
      this.sendResponse(packet, nas.secret, rinfo, sendResponse);
    } catch (error) {
      logger.error(`Error processing Accounting-Request: ${error.message}`, {
        error,
      });
    }
  }

  /**
   * Handle Accounting Start
   */
  async handleStart(userId, username, sessionId, nasIp, framedIp, macAddress) {
    if (userId) {
      this.db.createSession(userId, sessionId, nasIp, framedIp, macAddress);
      logger.info(`Session started: ${sessionId} for user: ${username}`);
    }
  }

  /**
   * Handle Interim Update
   */
  async handleInterimUpdate(sessionId, data) {
    this.db.updateSession(sessionId, data);
    logger.debug(`Session updated: ${sessionId}`);
  }

  /**
   * Handle Accounting Stop
   */
  async handleStop(userId, username, sessionId, nasIp, data) {
    this.db.endSession(sessionId, data);
    logger.info(
      `Session stopped: ${sessionId} for user: ${username}, duration: ${this.formatUptime(data.sessionTime)}`,
    );
  }

  /**
   * Calculate total bytes (handling gigawords overflow)
   */
  calculateTotalBytes(octets, gigawords) {
    return Number(BigInt(octets) + BigInt(gigawords) * BigInt(4294967296));
  }

  /**
   * Format uptime from seconds to readable string
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = "";
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    result += `${secs}s`;

    return result.trim();
  }

  /**
   * Send Accounting-Response
   */
  sendResponse(packet, secret, rinfo, sendResponse) {
    try {
      const response = radius.encode_response({
        packet,
        code: "Accounting-Response",
        secret,
      });

      sendResponse(response, rinfo);
      logger.debug("Accounting-Response sent");
    } catch (error) {
      logger.error("Error sending Accounting-Response:", error);
    }
  }
}

export default AcctHandler;
