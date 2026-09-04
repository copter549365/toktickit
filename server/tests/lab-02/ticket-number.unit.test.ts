import { describe, it, expect } from 'vitest';
import {
  formatTicketNumber,
  parseTicketNumber,
  getNextTicketNumber,
  TICKET_NUMBER_REGEX,
} from '../../src/utils/ticketNumber.js';

describe('UNIT-01: Ticket Number Generator', () => {
  it('formats ticket number matching TKT-{yyyy}-{6 digits} regex', () => {
    const formatted = formatTicketNumber(2026, 1);
    expect(formatted).toBe('TKT-2026-000001');
    expect(formatted).toMatch(TICKET_NUMBER_REGEX);
  });

  it('correctly pads 6-digit sequence numbers', () => {
    expect(formatTicketNumber(2026, 42)).toBe('TKT-2026-000042');
    expect(formatTicketNumber(2026, 999999)).toBe('TKT-2026-999999');
  });

  it('parses ticket number accurately', () => {
    const parsed = parseTicketNumber('TKT-2026-000123');
    expect(parsed).toEqual({ year: 2026, sequence: 123 });

    expect(parseTicketNumber('INVALID-TICKET')).toBeNull();
  });

  it('getNextTicketNumber starts at sequence 1 when no tickets exist for the year', async () => {
    const mockPrisma = {
      ticket: {
        findFirst: async () => null,
      },
    } as any;

    const ticketNumber = await getNextTicketNumber(mockPrisma, new Date('2026-08-20'));
    expect(ticketNumber).toBe('TKT-2026-000001');
  });

  it('getNextTicketNumber increments monotonically when a ticket exists for that year', async () => {
    const mockPrisma = {
      ticket: {
        findFirst: async () => ({
          ticketNumber: 'TKT-2026-000005',
        }),
      },
    } as any;

    const ticketNumber = await getNextTicketNumber(mockPrisma, new Date('2026-08-20'));
    expect(ticketNumber).toBe('TKT-2026-000006');
  });
});
