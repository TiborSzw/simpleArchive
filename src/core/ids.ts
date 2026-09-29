const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id (10 chars base36, ~51 bits). Collisions are checked by callers where it matters. */
export function newId(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}
