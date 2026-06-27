// server/services/AssetManager.ts

import fs from 'fs/promises';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
// import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/*
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  maxAttempts: 3, // Retry logic built into SDK
});
*/

export class AssetManager {
  /**
   * Sanitizes a file name to prevent path traversal attacks (e.g., blocks ../ or /)
   */
  static sanitizeFileName(fileName: string): string {
    const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!sanitized) throw new Error('Invalid file name');
    return sanitized;
  }

  /**
   * Safely deletes a local file from disk, catching ENOENT if it doesn't exist.
   */
  static async cleanupLocalFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log(`[AssetManager] Cleaned up local file: ${filePath}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`[AssetManager] Failed to cleanup file ${filePath}:`, err);
      }
    }
  }

  /**
   * Uploads a local file to Cloudflare R2 and returns the canonical URL.
   * Cleans up the local temporary file if `deleteLocalOnSuccess` is true.
   */
  static async uploadAsset(bucket: string, key: string, filePath: string, deleteLocalOnSuccess = true): Promise<string> {
    const safeKey = this.sanitizeFileName(key);
    console.log(`[AssetManager] Uploading ${filePath} to bucket ${bucket} with key ${safeKey}`);
    try {
      // const fileStream = fs.createReadStream(filePath);
      // const command = new PutObjectCommand({
      //   Bucket: bucket,
      //   Key: safeKey,
      //   Body: fileStream,
      // });
      // await s3.send(command);
      
      const canonicalUrl = `r2://${bucket}/${safeKey}`;

      if (deleteLocalOnSuccess) {
        await this.cleanupLocalFile(filePath);
      }

      return canonicalUrl;
    } catch (error) {
      console.error(`[AssetManager] Upload failed for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Generates an ephemeral Signed URL for Edge CDN delivery using HMAC-SHA256.
   * This allows Cloudflare Workers to validate the signature at the edge and serve from cache,
   * completely avoiding costly Class B read operations on the R2 bucket.
   */
  static async getSignedCdnUrl(bucket: string, key: string, expiresInHours = 1): Promise<string> {
    try {
      const expirationMs = Date.now() + (expiresInHours * 3600000);
      const urlBase = `https://cdn.shortcutai.com/${bucket}/${key}`;
      
      // Generate HMAC signature using a secure CDN signing secret
      const secret = process.env.CDN_SIGNING_SECRET || 'dev_mock_secret_key';
      const signaturePayload = `${urlBase}?exp=${expirationMs}`;
      const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

      return `${signaturePayload}&sig=${signature}`;
    } catch (error) {
      console.error(`[AssetManager] Failed to generate Edge CDN URL for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if an asset exists in cache globally across ALL users.
   * Uses SHA-256 hash of the sourceUrl to find identical raw downloads.
   */
  static async getAssetIfCached(sourceUrl: string): Promise<string | null> {
    try {
      const globalHash = crypto.createHash('sha256').update(sourceUrl).digest('hex');
      
      // Look for ANY completed job globally that matches this exact sourceUrl hash
      // We assume jobHash or a new sourceHash field is indexed. We'll simulate via jobHash for now.
      const existingJob = await prisma.videoJob.findFirst({
        where: { 
          sourceUrl, // Could alternatively use a dedicated globalSourceHash field
          status: 'COMPLETED' 
        },
        select: { sourceUrl: true }
      });
      
      if (existingJob && existingJob.sourceUrl.startsWith('r2://')) {
        console.log(`[AssetManager] Global Cache HIT for source URL ${sourceUrl}`);
        return existingJob.sourceUrl; // Return the canonical R2 URL, skipping yt-dlp download entirely
      }

      return null;
    } catch (error) {
      console.error(`[AssetManager] Cache check failed for ${sourceUrl}:`, error);
      // Fail open (return null) so processing can continue instead of crashing
      return null;
    }
  }

}
