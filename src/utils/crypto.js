/**
 * Wiku Radius - Cryptographic Utilities
 *
 * Provides helper functions for MS-CHAP, MS-CHAPv2, CHAP, and other
 * authentication protocols used in RADIUS.
 */

import crypto from "crypto";
import md4 from "js-md4";
import { Buffer } from "buffer";

/**
 * Create DES key from 7 bytes to 8 bytes with parity bits
 * @param {Buffer} key7 - 7-byte key
 * @returns {Buffer} - 8-byte DES key
 */
export function createDesKey(key7) {
  const key8 = Buffer.alloc(8);

  key8[0] = key7[0] & 0xfe;
  key8[1] = ((key7[0] << 7) | (key7[1] >> 1)) & 0xfe;
  key8[2] = ((key7[1] << 6) | (key7[2] >> 2)) & 0xfe;
  key8[3] = ((key7[2] << 5) | (key7[3] >> 3)) & 0xfe;
  key8[4] = ((key7[3] << 4) | (key7[4] >> 4)) & 0xfe;
  key8[5] = ((key7[4] << 3) | (key7[5] >> 5)) & 0xfe;
  key8[6] = ((key7[5] << 2) | (key7[6] >> 6)) & 0xfe;
  key8[7] = (key7[6] << 1) & 0xfe;

  return key8;
}

/**
 * DES encrypt data using key
 * @param {Buffer} key - 16-byte key (will be expanded to 21 bytes)
 * @param {Buffer} data - 8-byte data to encrypt
 * @returns {Buffer} - 24-byte encrypted result
 */
export function desEncrypt(key, data) {
  // Expand key from 16 bytes to 21 bytes with padding
  const expandedKey = Buffer.concat([key, Buffer.alloc(5, 0)]);

  const result = Buffer.alloc(24);

  // Process 3 DES blocks
  for (let i = 0; i < 3; i++) {
    const desKey = expandedKey.slice(i * 7, i * 7 + 7);
    const key64 = createDesKey(desKey);

    const cipher = crypto.createCipheriv("des-ecb", key64, "");
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    encrypted.copy(result, i * 8);
  }

  return result;
}

/**
 * Generate NT Hash from password (MD4 of UTF-16LE password)
 * @param {string} password - Plain text password
 * @returns {Buffer} - 16-byte NT hash
 */
export function generateNTHash(password) {
  const passwordBuffer = Buffer.from(password, "utf16le");
  const ntHashHex = md4(passwordBuffer);
  return Buffer.from(ntHashHex, "hex");
}

/**
 * Generate NT Response for MS-CHAPv2
 * @param {Buffer} challenge - Authenticator challenge (16 bytes)
 * @param {Buffer} peerChallenge - Peer challenge (16 bytes)
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Buffer} - 24-byte NT Response
 */
export function generateNTResponse(
  challenge,
  peerChallenge,
  username,
  password,
) {
  const ntHash = generateNTHash(password);

  // Generate Challenge Hash
  const challengeHash = crypto
    .createHash("sha1")
    .update(peerChallenge)
    .update(challenge)
    .update(Buffer.from(username, "utf8"))
    .digest()
    .slice(0, 8);

  // Generate NT Response using DES
  return desEncrypt(ntHash, challengeHash);
}

/**
 * Generate Authenticator Response for MS-CHAPv2
 * @param {string} password - Password
 * @param {Buffer} ntResponse - NT Response (24 bytes)
 * @param {Buffer} peerChallenge - Peer challenge (16 bytes)
 * @param {Buffer} challenge - Authenticator challenge (16 bytes)
 * @param {string} username - Username
 * @returns {Buffer} - 20-byte Authenticator Response
 */
export function generateAuthenticatorResponse(
  password,
  ntResponse,
  peerChallenge,
  challenge,
  username,
) {
  const ntHash = generateNTHash(password);
  const passwordHashHashHex = md4(ntHash);
  const passwordHashHash = Buffer.from(passwordHashHashHex, "hex");

  // Magic constants as per RFC 2759
  const magic1 = Buffer.from([
    0x4d, 0x61, 0x67, 0x69, 0x63, 0x20, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72,
    0x20, 0x74, 0x6f, 0x20, 0x63, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0x20, 0x73,
    0x69, 0x67, 0x6e, 0x69, 0x6e, 0x67, 0x20, 0x63, 0x6f, 0x6e, 0x73, 0x74,
    0x61, 0x6e, 0x74,
  ]);

  const magic2 = Buffer.from([
    0x50, 0x61, 0x64, 0x20, 0x74, 0x6f, 0x20, 0x6d, 0x61, 0x6b, 0x65, 0x20,
    0x69, 0x74, 0x20, 0x64, 0x6f, 0x20, 0x6d, 0x6f, 0x72, 0x65, 0x20, 0x74,
    0x68, 0x61, 0x6e, 0x20, 0x6f, 0x6e, 0x65, 0x20, 0x69, 0x74, 0x65, 0x72,
    0x61, 0x74, 0x69, 0x6f, 0x6e,
  ]);

  const sha1 = crypto.createHash("sha1");
  sha1.update(passwordHashHash);
  sha1.update(ntResponse);
  sha1.update(magic1);
  const digest = sha1.digest();

  const challengeHash = crypto
    .createHash("sha1")
    .update(peerChallenge)
    .update(challenge)
    .update(Buffer.from(username, "utf8"))
    .digest()
    .slice(0, 8);

  const authResponse = crypto
    .createHash("sha1")
    .update(digest)
    .update(challengeHash)
    .update(magic2)
    .digest();

  return authResponse;
}

/**
 * Verify CHAP password
 * @param {string} password - Expected password
 * @param {Buffer} chapPassword - CHAP password (ID + hash)
 * @param {Buffer} chapChallenge - CHAP challenge
 * @returns {boolean} - True if valid
 */
export function verifyChap(password, chapPassword, chapChallenge) {
  try {
    const chapPasswordBuf = Buffer.isBuffer(chapPassword)
      ? chapPassword
      : Buffer.from(chapPassword);
    const chapChallengeBuf = Buffer.isBuffer(chapChallenge)
      ? chapChallenge
      : Buffer.from(chapChallenge);

    // First byte is CHAP ID
    const chapId = chapPasswordBuf[0];

    // Next 16 bytes are the received hash
    const receivedHash = chapPasswordBuf.slice(1);

    // Calculate hash with MD5(ID + Password + Challenge)
    const calculatedHash = crypto
      .createHash("md5")
      .update(Buffer.from([chapId]))
      .update(Buffer.from(password, "utf8"))
      .update(chapChallengeBuf)
      .digest();

    return receivedHash.equals(calculatedHash);
  } catch (error) {
    console.error("Error verifying CHAP:", error);
    return false;
  }
}

/**
 * Verify MS-CHAP password
 * @param {string} password - Expected password
 * @param {Buffer} challenge - Challenge
 * @param {Buffer} response - NT Response (24 bytes)
 * @returns {boolean} - True if valid
 */
export function verifyMSChap(password, challenge, response) {
  try {
    const ntHash = generateNTHash(password);
    const expectedResponse = desEncrypt(ntHash, challenge);
    return expectedResponse.equals(response);
  } catch (error) {
    console.error("Error verifying MS-CHAP:", error);
    return false;
  }
}

/**
 * Verify MS-CHAPv2 password
 * @param {string} password - Expected password
 * @param {Buffer} challenge - Authenticator challenge
 * @param {Buffer} peerChallenge - Peer challenge
 * @param {Buffer} response - NT Response
 * @param {string} username - Username
 * @returns {boolean} - True if valid
 */
export function verifyMSChapV2(
  password,
  challenge,
  peerChallenge,
  response,
  username,
) {
  try {
    const expectedResponse = generateNTResponse(
      challenge,
      peerChallenge,
      username,
      password,
    );
    return expectedResponse.equals(response);
  } catch (error) {
    console.error("Error verifying MS-CHAPv2:", error);
    return false;
  }
}

export default {
  createDesKey,
  desEncrypt,
  generateNTHash,
  generateNTResponse,
  generateAuthenticatorResponse,
  verifyChap,
  verifyMSChap,
  verifyMSChapV2,
};
