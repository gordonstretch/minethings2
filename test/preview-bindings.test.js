import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalPreviewSelections, PreviewBindingError, PreviewBindingRegistry
} from '../src/preview-bindings.js';

test('preview bindings compare canonical object fields and are single-use', () => {
  let currentTime = 1000;
  let tokenNumber = 0;
  const bindings = new PreviewBindingRegistry({
    now: () => currentTime,
    ttlMs: 5000,
    createToken: () => `preview-token-${String(++tokenNumber).padStart(8, '0')}`
  });
  const selection = { weapons: { 19: 2, 7: 1 }, mods: { 4: 1 } };
  const issued = bindings.issue({
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'land', selections: selection
  });
  assert.equal(issued.expiresAt, 6000);
  assert.deepEqual(bindings.consume(issued.token, {
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'land',
    selections: { mods: { 4: 1 }, weapons: { 7: 1, 19: 2 } }
  }), { issuedAt: 1000, expiresAt: 6000 });
  assert.throws(() => bindings.consume(issued.token, {
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'land', selections: selection
  }), (error) => error instanceof PreviewBindingError && error.code === 'missing');
  currentTime += 1;
});

test('preview bindings reject changed fields and consume the tampered token', () => {
  const bindings = new PreviewBindingRegistry({
    createToken: () => 'preview-token-tampered-0001'
  });
  const context = {
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'ship',
    selections: { cannons: { 8: 1 } }
  };
  const { token } = bindings.issue(context);
  assert.throws(() => bindings.consume(token, {
    ...context, selections: { cannons: { 8: 2 } }
  }), (error) => error instanceof PreviewBindingError && error.code === 'mismatch'
    && /changed after it was previewed/i.test(error.message));
  assert.throws(() => bindings.consume(token, context),
    (error) => error instanceof PreviewBindingError && error.code === 'missing');
});

test('preview bindings cannot be consumed by another session', () => {
  const bindings = new PreviewBindingRegistry({
    createToken: () => 'preview-token-session-000001'
  });
  const context = {
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'cargo',
    selections: { items: { 42: 3 } }
  };
  const { token } = bindings.issue(context);
  assert.throws(() => bindings.consume(token, { ...context, subject: 'session-b' }),
    (error) => error instanceof PreviewBindingError && error.code === 'subject');
  assert.doesNotThrow(() => bindings.consume(token, context));
});

test('preview bindings expire and cap outstanding previews for a session', () => {
  let currentTime = 100;
  let tokenNumber = 0;
  const bindings = new PreviewBindingRegistry({
    now: () => currentTime,
    ttlMs: 10,
    maxBindingsPerSubject: 2,
    createToken: () => `preview-token-cap-${String(++tokenNumber).padStart(8, '0')}`
  });
  const context = {
    subject: 'session-a', playerId: 3, resourceId: 12, kind: 'land',
    selections: { mods: {}, weapons: {} }
  };
  const first = bindings.issue(context).token;
  currentTime += 1;
  const second = bindings.issue(context).token;
  currentTime += 1;
  const third = bindings.issue(context).token;
  assert.throws(() => bindings.consume(first, context),
    (error) => error instanceof PreviewBindingError && error.code === 'missing');
  assert.doesNotThrow(() => bindings.consume(second, context));
  currentTime = 113;
  assert.throws(() => bindings.consume(third, context),
    (error) => error instanceof PreviewBindingError && error.code === 'expired');
});

test('preview selection canonicalization rejects values that cannot be represented exactly', () => {
  assert.equal(canonicalPreviewSelections({ b: 2, a: [true, null, 'x'] }),
    '{"a":[true,null,"x"],"b":2}');
  assert.throws(() => canonicalPreviewSelections({ count: Number.NaN }), /cannot be bound/);
  assert.throws(() => canonicalPreviewSelections({ missing: undefined }), /cannot be bound/);
});
