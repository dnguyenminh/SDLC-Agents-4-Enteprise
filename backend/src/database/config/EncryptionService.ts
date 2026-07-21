/**
 * SA4E-50 — EncryptionService: AES-256-GCM encryption for sensitive config values.
 * Manages the .dbkey file and provides encrypt/decrypt for password fields.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';

/** Prefix indicating a value is already encrypted */
const ENC_PREFIX = 'ENC:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Handles AES-256-GCM encryption/decryption using a file-based key.
 * The .dbkey file is a crypto secret, not application config.
 */
export class EncryptionService {
  constructor(private readonly keyPath: string) {}

  /**
   * Encrypt a plaintext value. Returns unchanged if already encrypted.
   * @param plaintext - The value to encrypt
   * @returns Encrypted string with 'ENC:' prefix
   */
  encrypt(plaintext: string): string {
    if (plaintext.startsWith(ENC_PREFIX)) return plaintext;
    const key = this.getOrCreateKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, enc, tag]).toString('base64');
  }

  /**
   * Decrypt an encrypted value. Returns unchanged if not encrypted.
   * @param ciphertext - The 'ENC:'-prefixed encrypted value
   * @returns Decrypted plaintext string
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
    const key = this.getOrCreateKey();
    const data = Buffer.from(ciphertext.slice(ENC_PREFIX.length), 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(data.length - TAG_LENGTH);
    const enc = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  }

  /** Load or create the 32-byte encryption key from disk */
  private getOrCreateKey(): Buffer {
    if (!fs.existsSync(this.keyPath)) {
      const key = crypto.randomBytes(32);
      fs.writeFileSync(this.keyPath, key);
      return key;
    }
    return fs.readFileSync(this.keyPath);
  }
}
