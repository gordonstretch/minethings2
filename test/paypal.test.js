import assert from 'node:assert/strict';
import test from 'node:test';
import { paypalConfiguration, paypalOrderSummary, paypalReadiness } from '../src/paypal.js';

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
      reference_id: 'purchase-7', invoice_id: 'MT-7', custom_id: '7',
      amount: { value: '4.99', currency_code: 'GBP' },
      payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED' }] }
    }]
  }), {
    orderId: 'ORDER-1', orderStatus: 'COMPLETED', referenceId: 'purchase-7',
    invoiceId: 'MT-7', customId: '7', amountMinor: 499, currency: 'GBP',
    captureId: 'CAPTURE-1', captureStatus: 'COMPLETED'
  });
});
