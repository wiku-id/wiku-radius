/**
 * Wiku Radius - Authentication Handler
 *
 * Handles RADIUS Access-Request packets
 */

import radius from "radius";
import { Buffer } from "buffer";
import * as crypto from "../utils/crypto.js";
import { authLogger as logger } from "../utils/logger.js";

/**
 * Authentication Handler Class
 */
class AuthHandler {
  constructor(database) {
    this.db = database;
  }

  /**
   * Handle Access-Request packet
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
        // Send reject with default secret (for debugging)
        this.sendReject(msg, "testing123", rinfo, sendResponse);
        return;
      }

      // Decode packet
      const packet = radius.decode({
        packet: msg,
        secret: nas.secret,
        raw: true,
      });

      if (packet.code !== "Access-Request") {
        logger.debug(
          `Ignoring non-Access-Request packet from ${rinfo.address}`,
        );
        return;
      }

      const username = packet.attributes["User-Name"];
      const password = packet.attributes["User-Password"] || null;

      logger.info(`Access-Request from ${rinfo.address} for user: ${username}`);

      // Find user
      const user = this.db.findUser(username);

      if (!user) {
        logger.info(`User not found: ${username}`);
        this.sendReject(msg, nas.secret, rinfo, sendResponse, packet);
        return;
      }

      // Check if user is expired
      if (user.expired_at && new Date(user.expired_at) < new Date()) {
        logger.info(`User expired: ${username}`);
        this.sendReject(msg, nas.secret, rinfo, sendResponse, packet);
        return;
      }

      // Authenticate user
      const authResult = this.authenticate(packet, user);

      if (authResult.success) {
        logger.info(`Access-Accept for user: ${username}`);
        this.sendAccept(
          packet,
          nas.secret,
          rinfo,
          sendResponse,
          user,
          authResult,
        );
      } else {
        logger.info(
          `Access-Reject for user: ${username} - ${authResult.reason}`,
        );
        this.sendReject(msg, nas.secret, rinfo, sendResponse, packet);
      }
    } catch (error) {
      logger.error(`Error processing Access-Request: ${error.message}`, {
        error,
      });
    }
  }

  /**
   * Authenticate user based on auth method
   */
  authenticate(packet, user) {
    const vendorAttrs = packet.attributes["Vendor-Specific"] || {};
    const expectedPassword = user.password;

    // MS-CHAPv2 Authentication (highest priority)
    if (vendorAttrs["MS-CHAP2-Response"]) {
      return this.authenticateMSChapV2(packet, vendorAttrs, user);
    }

    // MS-CHAP Authentication
    if (vendorAttrs["MS-CHAP-Response"]) {
      return this.authenticateMSChap(packet, vendorAttrs, user);
    }

    // CHAP Authentication
    if (
      packet.attributes["CHAP-Challenge"] &&
      packet.attributes["CHAP-Password"]
    ) {
      return this.authenticateChap(packet, user);
    }

    // PAP Authentication (plain text)
    if (packet.attributes["User-Password"]) {
      const password = packet.attributes["User-Password"];
      if (password === expectedPassword) {
        return { success: true };
      }
      return { success: false, reason: "Invalid password" };
    }

    return { success: false, reason: "No valid authentication method found" };
  }

  /**
   * MS-CHAPv2 Authentication
   */
  authenticateMSChapV2(packet, vendorAttrs, user) {
    try {
      const username = packet.attributes["User-Name"];
      const msChapResponse = Buffer.isBuffer(vendorAttrs["MS-CHAP2-Response"])
        ? vendorAttrs["MS-CHAP2-Response"]
        : Buffer.from(vendorAttrs["MS-CHAP2-Response"], "binary");
      const challenge = Buffer.isBuffer(vendorAttrs["MS-CHAP-Challenge"])
        ? vendorAttrs["MS-CHAP-Challenge"]
        : Buffer.from(vendorAttrs["MS-CHAP-Challenge"], "binary");

      // MS-CHAP2-Response format: Ident (1) + Flags (1) + Peer-Challenge (16) + Reserved (8) + NT-Response (24)
      const ident = msChapResponse[0];
      const peerChallenge = msChapResponse.slice(2, 18);
      const ntResponse = msChapResponse.slice(26, 50);

      const isValid = crypto.verifyMSChapV2(
        user.password,
        challenge,
        peerChallenge,
        ntResponse,
        username,
      );

      if (isValid) {
        // Generate MS-CHAP2-Success
        const authResponse = crypto.generateAuthenticatorResponse(
          user.password,
          ntResponse,
          peerChallenge,
          challenge,
          username,
        );

        const successMessage = `S=${authResponse.toString("hex").toUpperCase()}`;
        const msChap2Success = Buffer.concat([
          Buffer.from([ident]),
          Buffer.from(successMessage, "utf8"),
        ]);

        // Build VSA for MS-CHAP2-Success
        const vendorId = Buffer.alloc(4);
        vendorId.writeUInt32BE(311); // Microsoft vendor ID

        const vendorType = Buffer.from([26]); // MS-CHAP2-Success type
        const vendorLen = Buffer.from([msChap2Success.length + 2]);
        const msChap2SuccessVsa = Buffer.concat([
          vendorId,
          vendorType,
          vendorLen,
          msChap2Success,
        ]);

        return { success: true, msChap2SuccessVsa };
      }

      return { success: false, reason: "MS-CHAPv2 authentication failed" };
    } catch (error) {
      logger.error("MS-CHAPv2 authentication error:", error);
      return { success: false, reason: "MS-CHAPv2 error" };
    }
  }

  /**
   * MS-CHAP Authentication
   */
  authenticateMSChap(packet, vendorAttrs, user) {
    try {
      const msChapResponse = Buffer.isBuffer(vendorAttrs["MS-CHAP-Response"])
        ? vendorAttrs["MS-CHAP-Response"]
        : Buffer.from(vendorAttrs["MS-CHAP-Response"], "binary");
      const challenge = Buffer.isBuffer(vendorAttrs["MS-CHAP-Challenge"])
        ? vendorAttrs["MS-CHAP-Challenge"]
        : Buffer.from(vendorAttrs["MS-CHAP-Challenge"], "binary");

      // MS-CHAP-Response format: Ident (1) + Flags (1) + LM-Response (24) + NT-Response (24)
      const ntResponse = msChapResponse.slice(26, 50);

      const isValid = crypto.verifyMSChap(user.password, challenge, ntResponse);

      return {
        success: isValid,
        reason: isValid ? null : "MS-CHAP authentication failed",
      };
    } catch (error) {
      logger.error("MS-CHAP authentication error:", error);
      return { success: false, reason: "MS-CHAP error" };
    }
  }

  /**
   * CHAP Authentication
   */
  authenticateChap(packet, user) {
    try {
      const isValid = crypto.verifyChap(
        user.password,
        packet.attributes["CHAP-Password"],
        packet.attributes["CHAP-Challenge"],
      );

      return {
        success: isValid,
        reason: isValid ? null : "CHAP authentication failed",
      };
    } catch (error) {
      logger.error("CHAP authentication error:", error);
      return { success: false, reason: "CHAP error" };
    }
  }

  /**
   * Send Access-Accept response
   */
  sendAccept(packet, secret, rinfo, sendResponse, user, authResult = {}) {
    const attributes = [["User-Name", user.username]];

    // Add profile as Filter-Id or MikroTik-Group
    if (user.profile && user.profile !== "default") {
      // Check if it's MikroTik and add vendor-specific attribute
      const vendorId = Buffer.alloc(4);
      vendorId.writeUInt32BE(14988); // MikroTik vendor ID

      const groupValue = Buffer.from(user.profile, "utf8");
      const vendorType = Buffer.from([3]); // Mikrotik-Group
      const vendorLen = Buffer.from([groupValue.length + 2]);
      const mikrotikGroupVsa = Buffer.concat([
        vendorId,
        vendorType,
        vendorLen,
        groupValue,
      ]);

      attributes.push(["Vendor-Specific", mikrotikGroupVsa]);
      attributes.push(["Filter-Id", user.profile]);
    }

    // Add MS-CHAP2-Success if present
    if (authResult.msChap2SuccessVsa) {
      attributes.push(["Vendor-Specific", authResult.msChap2SuccessVsa]);
    }

    const response = radius.encode_response({
      packet,
      code: "Access-Accept",
      secret,
      attributes,
    });

    sendResponse(response, rinfo);
  }

  /**
   * Send Access-Reject response
   */
  sendReject(msg, secret, rinfo, sendResponse, packet = null) {
    try {
      if (!packet) {
        packet = radius.decode({ packet: msg, secret });
      }

      const response = radius.encode_response({
        packet,
        code: "Access-Reject",
        secret,
      });

      sendResponse(response, rinfo);
    } catch (error) {
      logger.error("Error sending reject:", error);
    }
  }
}

export default AuthHandler;
