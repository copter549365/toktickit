import type { PrismaClient } from '../../generated/prisma/client.js';

export const TICKET_NUMBER_REGEX = /^TKT-\d{4}-\d{6}$/;

/**
 * Formats a year and sequence number into a standard ticket number.
 * e.g. (2026, 1) -> "TKT-2026-000001"
 */
export function formatTicketNumber(year: number, sequence: number): string {
  const seqStr = String(sequence).padStart(6, '0');
  return `TKT-${year}-${seqStr}`;
}

/**
 * Parses a ticket number into year and sequence.
 */
export function parseTicketNumber(ticketNumber: string): { year: number; sequence: number } | null {
  const match = ticketNumber.match(/^TKT-(\d{4})-(\d{6})$/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Generates the next sequential ticket number for the specified date/year by querying the database.
 */
export async function getNextTicketNumber(
  prisma: { ticket: { findFirst: PrismaClient['ticket']['findFirst'] } },
  date: Date = new Date(),
): Promise<string> {
  const year = date.getFullYear();
  const prefix = `TKT-${year}-`;

  const latestTicket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      ticketNumber: 'desc',
    },
    select: {
      ticketNumber: true,
    },
  });

  let nextSequence = 1;
  if (latestTicket?.ticketNumber) {
    const parsed = parseTicketNumber(latestTicket.ticketNumber);
    if (parsed) {
      nextSequence = parsed.sequence + 1;
    }
  }

  return formatTicketNumber(year, nextSequence);
}
