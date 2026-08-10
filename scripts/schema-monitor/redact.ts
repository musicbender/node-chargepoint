import type { Shape } from './types.js';

export class ShapeLeakError extends Error {
  constructor(
    public readonly path: string,
    public readonly key: string,
  ) {
    super(
      `Refusing to write shape: object key "${key}" at "${path}" looks like a dynamic value ` +
        '(id, hash, or token) rather than a field name. Shapes only ever store field NAMES and ' +
        'type NAMES, never response values — a dynamic key would leak real account data into a ' +
        'public repo. If this key is genuinely a stable field name, adjust the heuristic in ' +
        'redact.ts.',
    );
    this.name = 'ShapeLeakError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// A field/property name in a JSON API is a hand-picked identifier (camelCase or snake_case
// words). Anything that's purely numeric, UUID/hex-looking, or implausibly long is far more
// likely to be a dynamic value that ended up as an object key (e.g. a map keyed by user or
// session id) than a real field name.
const SUSPICIOUS_KEY_PATTERNS = [
  /^\d+$/, // all-digit — e.g. a userId used as a key
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^[0-9a-f]{16,}$/i, // long hex token/hash
];
const MAX_PLAUSIBLE_KEY_LENGTH = 64;

/**
 * Walks a `Shape` tree and throws `ShapeLeakError` if any object key looks like it's actually a
 * dynamic value rather than a field name. `Shape` never stores leaf values, so this is the only
 * remaining leak vector — but it's a real one for endpoints that key an object by id.
 */
export function assertRedacted(shape: Shape, path = '$'): void {
  if (shape.kind === 'array') {
    assertRedacted(shape.items, `${path}[]`);
    return;
  }
  if (shape.kind !== 'object') return;

  for (const key of Object.keys(shape.fields)) {
    if (isSuspiciousKey(key)) {
      throw new ShapeLeakError(path, key);
    }
    assertRedacted(shape.fields[key]!, `${path}.${key}`);
  }
}

function isSuspiciousKey(key: string): boolean {
  if (key.length > MAX_PLAUSIBLE_KEY_LENGTH) return true;
  return SUSPICIOUS_KEY_PATTERNS.some((re) => re.test(key));
}
