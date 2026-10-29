// docs/lab-04/specification.md §11 D-09: every user is on one campus, so times are shown and
// entered in Asia/Bangkok. Bangkok has no daylight saving, so the offset is always +07:00.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ISO instant → `YYYY-MM-DDTHH:mm` for a `datetime-local` input in Bangkok time. */
export function toBangkokInputValue(iso: string | Date): string {
  const shifted = new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS);
  return shifted.toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` entered in Bangkok time → ISO instant, or null when unparseable. */
export function fromBangkokInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Display format for action times, e.g. "3 Nov 2026, 10:15". */
export function formatBangkokDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
