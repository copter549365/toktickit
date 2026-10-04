const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*';

function pick(chars: string): string {
  return chars[Math.floor(Math.random() * chars.length)];
}

/**
 * Generates a random password that always satisfies BR-07 (8+ chars, upper, lower, number,
 * special) — used to pre-fill the Initial Password field (ui-spec.md §5.7), editable by the
 * Administrator before submitting.
 */
export function generateCompliantPassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
