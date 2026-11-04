import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { RequestCredentials } from './types.js';

export interface EncryptedTokenPayload extends RequestCredentials {
  /** Unix epoch seconds when this stateless token expires */
  exp?: number;
  v?: number;
  aud?: string;
  pro?: string;
  googleRefreshToken?: string;
  googleExpiresAt?: number;
  microsoftRefreshToken?: string;
  microsoftExpiresAt?: number;
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypts upstream OAuth credentials into a stateless AES-256-GCM Bearer token
 * (`fdmcp_enc_<iv>.<ciphertext>.<authTag>`). Zero server-side database storage is required.
 */
export function encryptStatelessTokenBundle(
  payload: EncryptedTokenPayload,
  secret: string
): string {
  if (!secret || secret.trim().length < 16) {
    throw new Error('Token encryption secret must be at least 16 characters.');
  }
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(payload.exp ?? now + 30 * 86400, now + 30 * 86400);
  if (!Number.isFinite(exp)) throw new Error('Invalid expiration.');
  const plaintext = Buffer.from(JSON.stringify({ ...payload, exp, v: 1, aud: 'feeds.theownersdesk.net' }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `fdmcp_enc_${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

/**
 * Decrypts and validates a stateless `fdmcp_enc_...` AES-256-GCM Bearer token.
 */
export function decryptStatelessTokenBundle(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): EncryptedTokenPayload {
  if (!token.startsWith('fdmcp_enc_')) {
    throw new Error('Not an encrypted feed-doctor token.');
  }
  const raw = token.slice('fdmcp_enc_'.length);
  const parts = raw.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token bundle.');
  }
  const [ivB64, cipherB64, tagB64] = parts;
  const key = deriveKey(secret);
  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(cipherB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Invalid IV or auth tag length in encrypted token.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8')) as EncryptedTokenPayload;
  if (parsed.v !== 1 || parsed.aud !== 'feeds.theownersdesk.net' ||
      typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) ||
      parsed.exp > nowEpochSeconds + 30 * 86400) throw new Error('Invalid token claims.');
  if (nowEpochSeconds >= parsed.exp) {
    throw new Error('Stateless token bundle has expired.');
  }
  return parsed;
}

/**
 * Encodes a `RequestCredentials` object as an unencrypted base64url Bearer token
 * (`fdmcp_b64_<base64url>`) for local/self-hosted HTTP transport convenience.
 */
export function encodeBase64TokenBundle(creds: RequestCredentials): string {
  return `fdmcp_b64_${Buffer.from(JSON.stringify(creds), 'utf8').toString('base64url')}`;
}

function parseBearerToken(
  bearerToken: string,
  env: NodeJS.ProcessEnv
): RequestCredentials {
  const trimmed = bearerToken.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('fdmcp_enc_')) {
    const secret = env.FEED_DOCTOR_TOKEN_SECRET || '';
    if (!secret) {
      throw new Error(
        'Received encrypted Bearer token (fdmcp_enc_*), but FEED_DOCTOR_TOKEN_SECRET is not configured.'
      );
    }
    const payload = decryptStatelessTokenBundle(trimmed, secret);
    return {
      googleAccessToken: payload.googleAccessToken,
      googleMerchantAccountId: payload.googleMerchantAccountId,
      microsoftAccessToken: payload.microsoftAccessToken,
      microsoftDeveloperToken: payload.microsoftDeveloperToken,
      microsoftMerchantId: payload.microsoftMerchantId,
      microsoftCustomerId: payload.microsoftCustomerId
    };
  }

  if (trimmed.startsWith('fdmcp_b64_')) {
    try {
      const jsonStr = Buffer.from(
        trimmed.slice('fdmcp_b64_'.length),
        'base64url'
      ).toString('utf8');
      const parsed = JSON.parse(jsonStr) as RequestCredentials;
      return {
        googleAccessToken: parsed.googleAccessToken,
        googleMerchantAccountId: parsed.googleMerchantAccountId,
        microsoftAccessToken: parsed.microsoftAccessToken,
        microsoftDeveloperToken: parsed.microsoftDeveloperToken,
        microsoftMerchantId: parsed.microsoftMerchantId,
        microsoftCustomerId: parsed.microsoftCustomerId
      };
    } catch {
      throw new Error('Malformed fdmcp_b64_ Bearer token bundle.');
    }
  }

  // Standard OAuth 2.0 Bearer token: treated as Google OAuth access token by default
  return {
    googleAccessToken: trimmed
  };
}

/**
 * Resolves credentials for a single request without storing anything beyond the call.
 * Priority order:
 *   1. Per-tool invocation override (`toolOverride`)
 *   2. Per-request HTTP headers / OAuth Bearer token (`requestHeaders` / `bearerToken`)
 *   3. Self-host environment variables (`env`)
 */
export function resolveRequestCredentials(options: {
  hosted?: boolean;
  toolOverride?: Partial<RequestCredentials>;
  requestHeaders?: Headers | Record<string, string | string[] | undefined>;
  bearerToken?: string;
  env?: NodeJS.ProcessEnv;
} = {}): RequestCredentials {
  const env = options.env ?? process.env;
  const getHeader = (name: string): string | undefined => {
    if (!options.requestHeaders) return undefined;
    if (typeof (options.requestHeaders as Headers).get === 'function') {
      const val = (options.requestHeaders as Headers).get(name);
      return val?.trim() || undefined;
    }
    const rec = options.requestHeaders as Record<string, string | string[] | undefined>;
    const found = rec[name] ?? rec[name.toLowerCase()];
    if (Array.isArray(found)) return found[0]?.trim() || undefined;
    return found?.trim() || undefined;
  };

  let bearerCreds: RequestCredentials = {};
  const authHeader = getHeader('authorization');
  const rawBearer =
    options.bearerToken ??
    (authHeader && /^Bearer\s+(.+)$/i.test(authHeader)
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : undefined);

  if (options.hosted || env.FEED_DOCTOR_HOSTED === '1') {
    if (options.toolOverride && Object.keys(options.toolOverride).length) throw new Error('Credential overrides are disabled.');
    if (!rawBearer?.startsWith('fdmcp_enc_')) throw new Error('Encrypted bearer token required.');
    return parseBearerToken(rawBearer, env);
  }

  if (rawBearer) {
    bearerCreds = parseBearerToken(rawBearer, env);
  }

  const override = options.toolOverride ?? {};

  return {
    googleAccessToken:
      override.googleAccessToken ||
      getHeader('x-google-access-token') ||
      bearerCreds.googleAccessToken ||
      env.GOOGLE_ACCESS_TOKEN ||
      undefined,
    googleMerchantAccountId:
      override.googleMerchantAccountId ||
      getHeader('x-google-merchant-account-id') ||
      bearerCreds.googleMerchantAccountId ||
      env.GOOGLE_MERCHANT_ACCOUNT_ID ||
      undefined,
    microsoftAccessToken:
      override.microsoftAccessToken ||
      getHeader('x-microsoft-access-token') ||
      bearerCreds.microsoftAccessToken ||
      env.MICROSOFT_ACCESS_TOKEN ||
      undefined,
    microsoftDeveloperToken:
      override.microsoftDeveloperToken ||
      getHeader('x-microsoft-developer-token') ||
      bearerCreds.microsoftDeveloperToken ||
      env.MICROSOFT_DEVELOPER_TOKEN ||
      undefined,
    microsoftMerchantId:
      override.microsoftMerchantId ||
      getHeader('x-microsoft-merchant-id') ||
      bearerCreds.microsoftMerchantId ||
      env.MICROSOFT_MERCHANT_ID ||
      undefined,
    microsoftCustomerId:
      override.microsoftCustomerId ||
      getHeader('x-microsoft-customer-id') ||
      bearerCreds.microsoftCustomerId ||
      env.MICROSOFT_CUSTOMER_ID ||
      undefined
  };
}
