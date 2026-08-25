import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GoogleAuthClient, googleAuthConfiguration, googleAuthReadiness, googlePkceChallenge
} from '../src/google-auth.js';

test('builds a protected Google authorization-code request for the local callback', () => {
  const config = googleAuthConfiguration({
    enabled: true,
    clientId: 'local-client.apps.googleusercontent.com',
    clientSecret: 'local-secret',
    publicOrigin: 'http://127.0.0.1:3000'
  });
  assert.equal(config.redirectUri, 'http://127.0.0.1:3000/auth/google/callback');
  assert.deepEqual(googleAuthReadiness(config), { ready: true, missing: [] });
  const verifier = 'local-pkce-verifier-with-enough-entropy-1234567890';
  const url = new URL(new GoogleAuthClient(config).authorizationUrl({
    state: 'local-state',
    nonce: 'local-nonce',
    codeChallenge: googlePkceChallenge(verifier)
  }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.searchParams.get('state'), 'local-state');
  assert.equal(url.searchParams.get('nonce'), 'local-nonce');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope'), /openid/u);
  assert.match(url.searchParams.get('scope'), /email/u);
});

test('requires complete credentials and HTTPS when Google login is enabled', () => {
  const incomplete = googleAuthConfiguration({
    enabled: true, clientId: '', clientSecret: '', publicOrigin: 'http://127.0.0.1:3000'
  });
  assert.deepEqual(googleAuthReadiness(incomplete), {
    ready: false, missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
  });
  const local = googleAuthConfiguration({
    enabled: true, clientId: 'client', clientSecret: 'secret',
    publicOrigin: 'http://127.0.0.1:3000'
  });
  assert.deepEqual(googleAuthReadiness(local, true), {
    ready: false, missing: ['an HTTPS MINETHINGS_PUBLIC_ORIGIN']
  });
});
