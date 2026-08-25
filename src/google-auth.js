import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_LOCAL_ORIGIN = 'http://127.0.0.1:3000';

function optionalString(value) {
  return String(value ?? '').trim();
}

function normalizedOrigin(value) {
  const candidate = optionalString(value) || DEFAULT_LOCAL_ORIGIN;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Google login public origin must be an absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Google login public origin must contain only an HTTP(S) origin.');
  }
  return parsed.origin;
}

export function googleAuthConfiguration(overrides = {}) {
  const clientId = optionalString(overrides.clientId ?? process.env.GOOGLE_CLIENT_ID);
  const clientSecret = optionalString(overrides.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET);
  const publicOrigin = normalizedOrigin(overrides.publicOrigin
    ?? process.env.MINETHINGS_PUBLIC_ORIGIN ?? DEFAULT_LOCAL_ORIGIN);
  const explicitlyEnabled = overrides.enabled ?? process.env.GOOGLE_AUTH_ENABLED;
  const enabled = explicitlyEnabled === undefined
    ? Boolean(clientId && clientSecret)
    : explicitlyEnabled === true || explicitlyEnabled === '1';
  return {
    enabled,
    clientId,
    clientSecret,
    publicOrigin,
    redirectUri: `${publicOrigin}/auth/google/callback`
  };
}

export function googleAuthReadiness(config, production = false) {
  if (!config.enabled) return { ready: false, missing: ['Google login is disabled'] };
  const missing = [];
  if (!config.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!config.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (production && !config.publicOrigin.startsWith('https://')) {
    missing.push('an HTTPS MINETHINGS_PUBLIC_ORIGIN');
  }
  return { ready: missing.length === 0, missing };
}

export function googlePkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function sameSecret(actual, expected) {
  const actualBuffer = Buffer.from(String(actual ?? ''));
  const expectedBuffer = Buffer.from(String(expected ?? ''));
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export class GoogleAuthClient {
  constructor(config) {
    this.config = config;
    this.client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  }

  authorizationUrl({ state, nonce, codeChallenge }) {
    const url = this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });
    const parsed = new URL(url);
    if (parsed.origin + parsed.pathname !== AUTHORIZE_ENDPOINT) {
      throw new Error('Google returned an unexpected authorization endpoint.');
    }
    return url;
  }

  async exchangeCode(code, { codeVerifier, nonce }) {
    const { tokens } = await this.client.getToken({
      code: String(code ?? ''),
      codeVerifier,
      redirect_uri: this.config.redirectUri
    });
    if (!tokens.id_token) throw new Error('Google did not return an identity token.');
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.clientId
    });
    const payload = ticket.getPayload();
    if (!payload || !sameSecret(payload.nonce, nonce)) {
      throw new Error('Google login replay protection failed.');
    }
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new Error('Google did not provide a verified email address.');
    }
    return {
      subject: String(payload.sub),
      email: String(payload.email).trim().toLowerCase(),
      name: optionalString(payload.name),
      picture: optionalString(payload.picture)
    };
  }
}
