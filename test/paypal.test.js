import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PayPalClient, paypalApprovalUrl, paypalConfiguration, paypalOrderSummary, paypalReadiness
} from '../src/paypal.js';

test('hard-gates live PayPal checkout on HTTPS, webhook and published seller identity', () => {
  const incomplete = paypalConfiguration({
    enabled: true, environment: 'live', clientId: 'id', clientSecret: 'secret',
    publicOrigin: 'http://minethings.example'
  }, {});
  const blocked = paypalReadiness(incomplete, {});
  assert.equal(blocked.ready, false);
  assert.ok(blocked.missing.includes('PayPal webhook ID'));
  assert.ok(blocked.missing.includes('HTTPS public site origin'));
  assert.ok(blocked.missing.includes('seller legal name'));

  const complete = paypalConfiguration({
    enabled: true, environment: 'live', clientId: 'id', clientSecret: 'secret',
    webhookId: 'hook', publicOrigin: 'https://minethings.example/'
  }, {});
  assert.deepEqual(paypalReadiness(complete, {
    legalName: 'Seller', legalAddress: '1 Test Street', legalEmail: 'seller@example.test'
  }), { ready: true, missing: [] });
});
test('summarises PayPal orders without trusting browser-provided purchase values', () => {
  assert.deepEqual(paypalOrderSummary({
    id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{
      reference_id: 'purchase-7',
      amount: { value: '4.99', currency_code: 'GBP' },
      payments: { captures: [{
        id: 'CAPTURE-1', status: 'COMPLETED', invoice_id: 'MT-7', custom_id: '7'
      }] }
    }]
  }), {
    orderId: 'ORDER-1', orderStatus: 'COMPLETED', referenceId: 'purchase-7',
    invoiceId: 'MT-7', customId: '7', amountMinor: 499, currency: 'GBP',
    captureId: 'CAPTURE-1', captureStatus: 'COMPLETED'
  });
});

test('selects only a GET payer approval link from a PayPal order', () => {
  assert.equal(paypalApprovalUrl({ links: [
    { rel: 'approve', method: 'POST', href: 'https://wrong.example.test' },
    {
      rel: 'payer-action', method: 'GET',
      href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1'
    }
  ] }), 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1');
  assert.equal(paypalApprovalUrl({ links: [{ rel: 'capture', method: 'POST', href: 'capture' }] }), '');
});

test('reports rejected credentials without exposing them and caches valid authentication', async () => {
  const rejected = new PayPalClient(paypalConfiguration({
    enabled: true, environment: 'live', clientId: 'live-id', clientSecret: 'live-secret'
  }, {}), async (url, options) => {
    assert.equal(url, 'https://api-m.paypal.com/v1/oauth2/token');
    assert.equal(options.body, 'grant_type=client_credentials');
    assert.equal(Buffer.from(options.headers.authorization.slice('Basic '.length), 'base64')
      .toString(), 'live-id:live-secret');
    return new Response(JSON.stringify({ error: 'invalid_client' }), {
      status: 401, headers: { 'content-type': 'application/json', 'paypal-debug-id': 'debug-1' }
    });
  });
  await assert.rejects(() => rejected.authenticate(), (error) => {
    assert.equal(error.code, 'PAYPAL_CREDENTIALS_REJECTED');
    assert.equal(error.paypalDebugId, 'debug-1');
    assert.match(error.message, /No payment was attempted/u);
    assert.doesNotMatch(error.message, /live-(?:id|secret)/u);
    return true;
  });

  let tokenRequests = 0;
  const accepted = new PayPalClient(paypalConfiguration({
    enabled: true, environment: 'sandbox', clientId: 'id', clientSecret: 'secret'
  }, {}), async () => {
    tokenRequests += 1;
    return new Response(JSON.stringify({ access_token: 'token', expires_in: 300 }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  });
  assert.equal(await accepted.authenticate(), true);
  assert.equal(await accepted.authenticate(), true);
  assert.equal(tokenRequests, 1);
});
