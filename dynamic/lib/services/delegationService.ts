/**
 * Delegation Service
 * Handles Dynamic Labs Delegated Access webhook verification and decryption
 * Based on: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/delegated-access/receiving-delegation
 */

import crypto from 'node:crypto';
import { EncryptedPayload, DelegationWebhook, DelegatedAccess } from '@/types';

export class DelegationService {
  /**
   * Verify webhook signature
   * TODO: Implement webhook signature verification
   * See: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/delegated-access/receiving-delegation
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    // TODO: Implement webhook signature verification
    // For now, return true (in production, you MUST verify the signature)
    console.warn('⚠️ Webhook signature verification not implemented. This should be implemented in production!');
    return true;
  }

  /**
   * Decrypt AES-256-GCM encrypted data
   */
  private decryptAesGcm(
    encryptedKey: Buffer,
    ivB64: string,
    ctB64: string,
    tagB64: string
  ): Buffer {
    const iv = Buffer.from(ivB64, 'base64url');
    const ciphertext = Buffer.from(ctB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptedKey, iv);
    decipher.setAuthTag(tag);
    
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    
    return plaintext;
  }

  /**
   * Decrypt RSA-OAEP encrypted content-encryption key
   */
  private rsaOaepDecryptEk(privateKeyPem: string, ekB64: string): Buffer {
    // Ensure private key has proper newlines (replace literal \n with actual newlines)
    // This handles the case where .env file has escaped newlines
    const normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
    
    try {
      return crypto.privateDecrypt(
        {
          key: normalizedKey,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(ekB64, 'base64url')
      );
    } catch (error: any) {
      console.error('RSA-OAEP decryption error:', {
        error: error.message,
        keyLength: normalizedKey.length,
        keyStartsWith: normalizedKey.substring(0, 30),
        keyEndsWith: normalizedKey.substring(normalizedKey.length - 30),
        hasNewlines: normalizedKey.includes('\n'),
      });
      throw new Error(`Failed to decrypt content-encryption key: ${error.message}`);
    }
  }

  /**
   * Decrypt delegation materials
   * @param privateKeyPem RSA private key in PEM format (for decrypting content-encryption keys)
   * @param share Encrypted delegated share
   * @param apiKeyEnc Encrypted wallet API key
   * @returns Decrypted materials
   */
  decryptMaterials(
    privateKeyPem: string,
    share: EncryptedPayload,
    apiKeyEnc: EncryptedPayload
  ): {
    delegatedShare: any;
    walletApiKey: string;
  } {
    try {
      // Ensure private key has proper newlines
      const normalizedPrivateKey = privateKeyPem.replace(/\\n/g, '\n');
      
      // Decrypt content-encryption keys using RSA-OAEP
      console.log('Decrypting content-encryption keys...');
      const shareKey = this.rsaOaepDecryptEk(normalizedPrivateKey, share.ek);
      const walletApiKeyKey = this.rsaOaepDecryptEk(normalizedPrivateKey, apiKeyEnc.ek);
      console.log('Content-encryption keys decrypted successfully');

      // Decrypt actual data using AES-256-GCM
      console.log('Decrypting delegated share...');
      const delegatedShareBuffer = this.decryptAesGcm(
        shareKey,
        share.iv,
        share.ct,
        share.tag
      );
      console.log('Decrypting wallet API key...');
      const walletApiKeyBuffer = this.decryptAesGcm(
        walletApiKeyKey,
        apiKeyEnc.iv,
        apiKeyEnc.ct,
        apiKeyEnc.tag
      );
      console.log('All materials decrypted successfully');

      // Parse JSON for delegated share, convert buffer to string for API key
      const delegatedShare = JSON.parse(delegatedShareBuffer.toString('utf8'));
      const walletApiKey = walletApiKeyBuffer.toString('utf8');

      return {
        delegatedShare,
        walletApiKey,
      };
    } catch (error: any) {
      console.error('Decryption error:', {
        error: error.message,
        stack: error.stack,
        shareEkLength: share.ek?.length,
        apiKeyEkLength: apiKeyEnc.ek?.length,
        shareIvLength: share.iv?.length,
        apiKeyIvLength: apiKeyEnc.iv?.length,
      });
      throw new Error(`Failed to decrypt delegation materials: ${error.message}`);
    }
  }

  /**
   * Process delegation webhook
   * Verifies signature, decrypts materials, and returns structured data
   */
  async processDelegationWebhook(
    webhook: DelegationWebhook,
    privateKeyPem: string,
    webhookSecret?: string
  ): Promise<{
    userId: string;
    walletId: string;
    publicKey: string;
    delegatedShare: any;
    walletApiKey: string;
    eventId: string;
  }> {
    // Verify webhook signature (if webhookSecret provided)
    if (webhookSecret) {
      const payload = JSON.stringify(webhook);
      const signature = ''; // TODO: Extract signature from headers
      if (!this.verifyWebhookSignature(payload, signature, webhookSecret)) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Decrypt materials
    const { delegatedShare, walletApiKey } = this.decryptMaterials(
      privateKeyPem,
      webhook.data.encryptedDelegatedShare,
      webhook.data.encryptedWalletApiKey
    );

    return {
      userId: webhook.data.userId,
      walletId: webhook.data.walletId,
      publicKey: webhook.data.publicKey,
      delegatedShare,
      walletApiKey,
      eventId: webhook.eventId,
    };
  }
}

// Singleton instance
export const delegationService = new DelegationService();

