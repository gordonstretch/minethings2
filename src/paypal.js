const API_ORIGINS = Object.freeze({
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com'
});

function money(amountMinor) {
  return (Number(amountMinor) / 100).toFixed(2);
}

function checkedEnvironment(value) {
  const environment = String(value ?? 'sandbox').toLowerCase();
  if (!Object.hasOwn(API_ORIGINS, environment)) throw new Error('PAYPAL_ENV must be sandbox or live.');
  return environment;
}

export function paypalConfiguration(options = {}, environment = process.env) {
  const mode = checkedEnvironment(options.environment ?? environment.PAYPAL_ENV);
  const enabledValue = options.enabled ?? environment.PAYPAL_ENABLED;
  return Object.freeze({
    enabled: enabledValue === true || enabledValue === '1' || enabledValue === 'true',
    environment: mode,
    clientId: String(options.clientId ?? environment.PAYPAL_CLIENT_ID ?? '').trim(),
    clientSecret: String(options.clientSecret ?? environment.PAYPAL_CLIENT_SECRET ?? '').trim(),
    webhookId: String(options.webhookId ?? environment.PAYPAL_WEBHOOK_ID ?? '').trim(),
    publicOrigin: String(options.publicOrigin ?? environment.MINETHINGS_PUBLIC_ORIGIN ?? '').trim().replace(/\/$/, ''),
    apiOrigin: API_ORIGINS[mode]
  });
}

export function paypalReadiness(config, seller) {
  const missing = [];
  if (!config.enabled) missing.push('checkout is not enabled');
  if (!config.clientId) missing.push('PayPal client ID');
  if (!config.clientSecret) missing.push('PayPal client secret');
  if (!config.publicOrigin) missing.push('public site origin');
  if (config.environment === 'live') {
    if (!config.webhookId) missing.push('PayPal webhook ID');
    if (!config.publicOrigin.startsWith('https://')) missing.push('HTTPS public site origin');
    if (!seller?.legalName) missing.push('seller legal name');
    if (!seller?.legalAddress) missing.push('seller geographic address');
    if (!seller?.legalEmail) missing.push('seller contact email');
  }
  return Object.freeze({ ready: missing.length === 0, missing });
}

export function paypalOrderSummary(order) {
  const unit = order?.purchase_units?.[0] ?? {};
  const capture = unit.payments?.captures?.[0] ?? null;
  return {
    orderId: order?.id ?? '',
    orderStatus: order?.status ?? '',
    referenceId: unit.reference_id ?? '',
    invoiceId: unit.invoice_id ?? '',
    customId: unit.custom_id ?? '',
    amountMinor: Math.round(Number(unit.amount?.value ?? capture?.amount?.value ?? 0) * 100),
    currency: unit.amount?.currency_code ?? capture?.amount?.currency_code ?? '',
    captureId: capture?.id ?? '',
    captureStatus: capture?.status ?? ''
  };
}

export class PayPalClient {
  constructor(config, fetchImplementation = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImplementation;
    this.cachedToken = null;
  }

  async #accessToken() {
    if (this.cachedToken?.expiresAt > Date.now() + 30000) return this.cachedToken.value;
    const authorization = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await this.fetch(`${this.config.apiOrigin}/v1/oauth2/token`, {
      method: 'POST', headers: {
        authorization: `Basic ${authorization}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      }, body: 'grant_type=client_credentials'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      const credentialsRejected = response.status === 401 || payload.error === 'invalid_client';
      const error = new Error(credentialsRejected
        ? 'PayPal checkout is temporarily unavailable because its server credentials were rejected. No payment was attempted.'
        : 'PayPal authentication is temporarily unavailable. No payment was attempted.');
      error.code = credentialsRejected
        ? 'PAYPAL_CREDENTIALS_REJECTED' : 'PAYPAL_AUTHENTICATION_UNAVAILABLE';
      error.statusCode = Number(response.status) || 502;
      error.paypalDebugId = response.headers?.get?.('paypal-debug-id') ?? '';
      throw error;
    }
    this.cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 300) * 1000
    };
    return this.cachedToken.value;
  }

  async authenticate() {
    await this.#accessToken();
    return true;
  }

  async #request(path, { method = 'GET', body, requestId } = {}) {
    const token = await this.#accessToken();
    const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (requestId) headers['paypal-request-id'] = requestId;
    const response = await this.fetch(`${this.config.apiOrigin}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const issue = payload?.details?.[0]?.description ?? payload?.message ?? `HTTP ${response.status}`;
      throw new Error(`PayPal rejected the request: ${issue}`);
    }
    return payload;
  }

  async createOrder(purchase) {
    const order = await this.#request('/v2/checkout/orders', {
      method: 'POST', requestId: `minethings-create-${purchase.id}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: `purchase-${purchase.id}`,
          invoice_id: `MT-${purchase.id}`,
          custom_id: String(purchase.id),
          description: purchase.bundleName,
          amount: { currency_code: purchase.currency, value: money(purchase.amountMinor) }
        }],
        payment_source: { paypal: { experience_context: {
          brand_name: 'MineThings', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
          return_url: `${this.config.publicOrigin}/credits/paypal/return`,
          cancel_url: `${this.config.publicOrigin}/credits/paypal/cancel`
        } } }
      }
    });
    const approveUrl = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
    if (!order.id || !approveUrl) throw new Error('PayPal did not provide an approval link.');
    return { order, approveUrl };
  }

  captureOrder(orderId, purchaseId) {
    return this.#request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST', body: {}, requestId: `minethings-capture-${purchaseId}`
    });
  }

  getOrder(orderId) {
    return this.#request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  verifyWebhook(headers, event) {
    if (!this.config.webhookId) throw new Error('PayPal webhook verification is not configured.');
    return this.#request('/v1/notifications/verify-webhook-signature', {
      method: 'POST', body: {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: this.config.webhookId,
        webhook_event: event
      }
    }).then((result) => result.verification_status === 'SUCCESS');
  }
}
