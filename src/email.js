import nodemailer from 'nodemailer';

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function emailConfiguration(overrides = {}) {
  const host = String(overrides.host ?? process.env.SMTP_HOST ?? '').trim();
  const secure = booleanValue(overrides.secure ?? process.env.SMTP_SECURE, false);
  const portValue = Number(overrides.port ?? process.env.SMTP_PORT ?? (secure ? 465 : 587));
  return {
    host,
    port: Number.isSafeInteger(portValue) && portValue > 0 ? portValue : (secure ? 465 : 587),
    secure,
    user: String(overrides.user ?? process.env.SMTP_USER ?? '').trim(),
    password: String(overrides.password ?? process.env.SMTP_PASSWORD ?? ''),
    from: String(overrides.from ?? process.env.MINETHINGS_EMAIL_FROM ?? '').trim(),
    publicOrigin: String(overrides.publicOrigin ?? process.env.MINETHINGS_PUBLIC_ORIGIN ?? '')
      .trim().replace(/\/$/u, '')
  };
}

export function emailReadiness(config, production = false) {
  const missing = [];
  if (!config.host) missing.push('SMTP host');
  if (!config.from) missing.push('sender address');
  if (!config.publicOrigin) missing.push('public origin');
  if (Boolean(config.user) !== Boolean(config.password)) missing.push('complete SMTP credentials');
  if (config.publicOrigin) {
    try {
      const origin = new URL(config.publicOrigin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== config.publicOrigin) {
        missing.push('valid public origin');
      } else if (production && origin.protocol !== 'https:') {
        missing.push('HTTPS public origin');
      }
    } catch {
      missing.push('valid public origin');
    }
  }
  return { ready: missing.length === 0, missing: [...new Set(missing)] };
}

export class EmailClient {
  constructor(config, transport = null) {
    this.config = config;
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.password } } : {})
    });
  }

  async sendVerification({ email, minerName, verificationUrl, expiresIn }) {
    return this.transport.sendMail({
      from: this.config.from,
      to: email,
      subject: 'Verify your MineThings email address',
      text: `Hello ${minerName},\n\nConfirm this email address to unlock your MineThings account:\n${verificationUrl}\n\nThis single-use link expires in ${expiresIn}. If you did not create or update this account, ignore this message.\n`,
      html: `<p>Hello ${escapeEmailHtml(minerName)},</p><p>Confirm this email address to unlock your MineThings account:</p><p><a href="${escapeEmailHtml(verificationUrl)}">Verify my email address</a></p><p>This single-use link expires in ${escapeEmailHtml(expiresIn)}. If you did not create or update this account, ignore this message.</p>`
    });
  }
}

function escapeEmailHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
