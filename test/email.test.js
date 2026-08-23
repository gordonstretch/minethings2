import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailClient, emailConfiguration, emailReadiness } from '../src/email.js';

test('requires complete HTTPS email delivery configuration in production', () => {
  const incomplete = emailConfiguration({ host: '', from: '', publicOrigin: '' });
  assert.equal(emailReadiness(incomplete, true).ready, false);
  assert.deepEqual(emailReadiness(incomplete, true).missing,
    ['SMTP host', 'sender address', 'public origin']);
  const insecure = emailConfiguration({
    host: 'smtp.example.test', from: 'MineThings <mail@example.test>',
    publicOrigin: 'http://game.example.test'
  });
  assert.deepEqual(emailReadiness(insecure, true).missing, ['HTTPS public origin']);
  const ready = emailConfiguration({
    host: 'smtp.example.test', port: 465, secure: true,
    user: 'mailer', password: 'secret', from: 'MineThings <mail@example.test>',
    publicOrigin: 'https://game.example.test'
  });
  assert.equal(emailReadiness(ready, true).ready, true);
});

test('sends a plain-text and escaped HTML verification link through SMTP', async () => {
  let message;
  const client = new EmailClient({ from: 'MineThings <mail@example.test>' }, {
    async sendMail(value) {
      message = value;
      return { messageId: 'test-message' };
    }
  });
  await client.sendVerification({
    email: 'miner@example.test', minerName: '<Miner & Co>',
    verificationUrl: 'https://game.example.test/verify-email?token=abc&next=1',
    expiresIn: '24 hours'
  });
  assert.equal(message.to, 'miner@example.test');
  assert.match(message.text, /https:\/\/game\.example\.test\/verify-email\?token=abc&next=1/);
  assert.match(message.html, /&lt;Miner &amp; Co&gt;/);
  assert.match(message.html, /token=abc&amp;next=1/);
  assert.doesNotMatch(message.html, /<Miner & Co>/);
});
