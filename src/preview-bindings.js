import crypto from 'node:crypto';

export class PreviewBindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PreviewBindingError';
    this.code = code;
  }
}

function canonicalValue(value, path = 'selections') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  }
  if (value && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key, canonicalValue(value[key], `${path}.${key}`)
    ]));
  }
  throw new TypeError(`${path} contains a value that cannot be bound to a preview.`);
}

export function canonicalPreviewSelections(selections) {
  return JSON.stringify(canonicalValue(selections));
}

function requiredIdentifier(value, name) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).length === 0) {
    throw new TypeError(`${name} is required.`);
  }
  return String(value);
}

/**
 * Keeps opaque, short-lived form previews on the server. The browser only receives a random token;
 * the exact previewed fields remain in this registry and must match when the token is consumed.
 */
export class PreviewBindingRegistry {
  constructor({ now = Date.now, ttlMs = 15 * 60 * 1000,
    createToken = () => crypto.randomBytes(32).toString('base64url'),
    maxBindingsPerSubject = 32 } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function.');
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new TypeError('ttlMs must be a positive safe integer.');
    }
    if (typeof createToken !== 'function') throw new TypeError('createToken must be a function.');
    if (!Number.isSafeInteger(maxBindingsPerSubject) || maxBindingsPerSubject <= 0) {
      throw new TypeError('maxBindingsPerSubject must be a positive safe integer.');
    }
    this.now = now;
    this.ttlMs = ttlMs;
    this.createToken = createToken;
    this.maxBindingsPerSubject = maxBindingsPerSubject;
    this.bindings = new Map();
  }

  #prune(currentTime = this.now()) {
    for (const [token, binding] of this.bindings) {
      if (binding.expiresAt <= currentTime) this.bindings.delete(token);
    }
  }

  issue({ subject, playerId, resourceId, kind, selections }) {
    const issuedAt = this.now();
    this.#prune(issuedAt);
    const normalizedSubject = requiredIdentifier(subject, 'subject');
    const binding = {
      subject: normalizedSubject,
      playerId: requiredIdentifier(playerId, 'playerId'),
      resourceId: requiredIdentifier(resourceId, 'resourceId'),
      kind: requiredIdentifier(kind, 'kind'),
      selections: canonicalPreviewSelections(selections),
      issuedAt,
      expiresAt: issuedAt + this.ttlMs
    };
    const existingForSubject = [...this.bindings.entries()]
      .filter(([, entry]) => entry.subject === normalizedSubject)
      .sort((first, second) => first[1].issuedAt - second[1].issuedAt);
    while (existingForSubject.length >= this.maxBindingsPerSubject) {
      this.bindings.delete(existingForSubject.shift()[0]);
    }
    let token;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      token = this.createToken();
      if (typeof token === 'string' && token.length >= 20 && !this.bindings.has(token)) break;
      token = null;
    }
    if (!token) throw new Error('Could not create a unique preview binding.');
    this.bindings.set(token, binding);
    return { token, issuedAt: binding.issuedAt, expiresAt: binding.expiresAt };
  }

  consume(token, { subject, playerId, resourceId, kind, selections }) {
    const currentTime = this.now();
    const binding = typeof token === 'string' ? this.bindings.get(token) : null;
    if (!binding) {
      throw new PreviewBindingError('missing', 'Preview this loadout again before committing it.');
    }
    if (binding.expiresAt <= currentTime) {
      this.bindings.delete(token);
      throw new PreviewBindingError('expired', 'This preview has expired. Preview the loadout again.');
    }
    const normalizedSubject = requiredIdentifier(subject, 'subject');
    if (binding.subject !== normalizedSubject) {
      throw new PreviewBindingError('subject', 'This preview belongs to another session.');
    }

    // A token is single-use for its owning session, including failed/tampered commit attempts.
    this.bindings.delete(token);
    const matches = binding.playerId === requiredIdentifier(playerId, 'playerId')
      && binding.resourceId === requiredIdentifier(resourceId, 'resourceId')
      && binding.kind === requiredIdentifier(kind, 'kind')
      && binding.selections === canonicalPreviewSelections(selections);
    if (!matches) {
      throw new PreviewBindingError('mismatch',
        'The loadout changed after it was previewed. Preview it again before committing.');
    }
    return { issuedAt: binding.issuedAt, expiresAt: binding.expiresAt };
  }

  revokeSubject(subject) {
    const normalizedSubject = requiredIdentifier(subject, 'subject');
    let count = 0;
    for (const [token, binding] of this.bindings) {
      if (binding.subject !== normalizedSubject) continue;
      this.bindings.delete(token);
      count += 1;
    }
    return count;
  }
}
