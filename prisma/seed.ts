/**
 * prisma/seed.ts — Lab 3 + Lab 4 idempotent seed
 *
 * Populates:
 *   - 4 Categories
 *   - 7 Related Systems
 *   - 12 Users  (5 active Requesters, 1 inactive Requester,
 *                4 active IT Staff, 1 inactive IT Staff, 1 Administrator)
 *   - 12 realistic Tickets  (all 8 statuses, all IT priorities, assigned and unassigned)
 *   - Sample PublicComments & InternalNotes on active tickets
 *   - Lab 4: Actions Taken (tickets with 0, 1 and 4 actions) and status history
 *     (docs/lab-04/specification.md §7.6)
 *
 * All upserts are keyed on natural/unique columns so the script is
 * safe to run multiple times without creating duplicates.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client.js';
import type { ActionTakenStatus, Priority, TicketStatus } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { getNextTicketNumber } from '../server/src/utils/ticketNumber.js';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;
const INITIAL_PASSWORD = 'InitialPassword123!';

// ---------------------------------------------------------------------------
// Static seed data
// ---------------------------------------------------------------------------

const categories = ['Account and Access', 'Hardware', 'Software', 'Network'];

const relatedSystems = [
  { name: 'Email',                isActive: true },
  { name: 'Campus Wi-Fi',         isActive: true },
  { name: 'VPN',                  isActive: true },
  { name: 'LEB2 App',             isActive: true },
  { name: 'Grade Submission App', isActive: true },
  { name: 'Corporate Laptop',     isActive: true },
  { name: 'Printer',              isActive: true },
];

const users = [
  // Requesters (active)
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.com', role: 'REQUESTER' as const, isActive: true },
  { name: 'David Lee',         email: 'david.lee@toktickit.com',         role: 'REQUESTER' as const, isActive: true },
  { name: 'Sarah Johnson',     email: 'sarah.johnson@toktickit.com',     role: 'REQUESTER' as const, isActive: true },
  { name: 'Emily Davis',       email: 'emily.davis@toktickit.com',       role: 'REQUESTER' as const, isActive: true },
  // Requester (inactive)
  { name: 'Robert Wilson',     email: 'robert.wilson@toktickit.com',     role: 'REQUESTER' as const, isActive: false },
  // IT Staff (active)
  { name: 'Michael Brown',     email: 'michael.brown@toktickit.com',     role: 'IT_STAFF' as const,  isActive: true },
  { name: 'Alex Thompson',     email: 'alex.thompson@toktickit.com',     role: 'IT_STAFF' as const,  isActive: true },
  { name: 'Lisa Martinez',     email: 'lisa.martinez@toktickit.com',     role: 'IT_STAFF' as const,  isActive: true },
  // IT Staff (inactive)
  { name: 'Kevin Patel',       email: 'kevin.patel@toktickit.com',       role: 'IT_STAFF' as const,  isActive: false },
  // Administrator
  { name: 'John Smith',        email: 'john.smith@toktickit.com',        role: 'ADMINISTRATOR' as const, isActive: true },
  // Lab 4 — zero-metric dashboard accounts (spec §7.6): Nina never gets a ticket, Olivia never
  // owns a ticket or gets an action assigned.
  { name: 'Nina Wong',         email: 'nina.wong@toktickit.com',         role: 'REQUESTER' as const, isActive: true },
  { name: 'Olivia Chen',       email: 'olivia.chen@toktickit.com',       role: 'IT_STAFF' as const,  isActive: true },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

// Canonical status path from NEW to each status, used to give seeded tickets a believable,
// append-only history (BR-17). RESOLVED is always reached through IN_PROGRESS (BR-13).
const TO_RESOLVED: [TicketStatus, TicketStatus][] = [
  ['NEW', 'OPEN'],
  ['OPEN', 'IN_PROGRESS'],
  ['IN_PROGRESS', 'RESOLVED'],
];
const STATUS_PATHS: Record<TicketStatus, [TicketStatus, TicketStatus][]> = {
  NEW: [],
  OPEN: [['NEW', 'OPEN']],
  IN_PROGRESS: [['NEW', 'OPEN'], ['OPEN', 'IN_PROGRESS']],
  WAITING_FOR_REQUESTER: [['NEW', 'OPEN'], ['OPEN', 'IN_PROGRESS'], ['IN_PROGRESS', 'WAITING_FOR_REQUESTER']],
  RESOLVED: TO_RESOLVED,
  CLOSED: [...TO_RESOLVED, ['RESOLVED', 'CLOSED']],
  REOPENED: [...TO_RESOLVED, ['RESOLVED', 'REOPENED']],
  CANCELLED: [['NEW', 'CANCELLED']],
};

type Timeline = {
  createdDaysAgo: number;
  /** When the ticket entered RESOLVED; also set for REOPENED tickets, which were resolved once. */
  resolvedDaysAgo?: number;
  resolutionSummary?: string;
  reopenReason?: string;
};

type SeedTicket = {
  key: string;
  requesterId: number;
  categoryName: string;
  systemName: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  currentStatus: TicketStatus;
  ticketOwnerId: number | null;
  requesterResolvedIndicator?: boolean;
};

/** Ticket columns derived from a timeline. resolvedAt is kept only while RESOLVED/CLOSED (BR-15). */
function timelineFields(status: TicketStatus, timeline: Timeline) {
  const isResolved = status === 'RESOLVED' || status === 'CLOSED';
  return {
    createdAt: daysAgo(timeline.createdDaysAgo),
    resolvedAt: isResolved && timeline.resolvedDaysAgo !== undefined ? daysAgo(timeline.resolvedDaysAgo) : null,
    resolutionSummary: timeline.resolutionSummary ?? null,
    reopenReason: timeline.reopenReason ?? null,
  };
}

type HistoryRow = {
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedById: number;
  note: string | null;
  createdAt: Date;
};

/**
 * Builds the append-only history for a freshly seeded ticket: a creation row, then the canonical
 * path to its current status. Steps up to RESOLVED end exactly at the timeline's resolution time,
 * so history and Ticket.resolvedAt agree; later steps (CLOSED, REOPENED) follow it.
 */
function buildHistory(
  ticket: { requesterId: number; ticketOwnerId: number | null; currentStatus: TicketStatus; createdAt: Date },
  timeline: Timeline,
  fallbackStaffId: number,
): HistoryRow[] {
  const staffId = ticket.ticketOwnerId ?? fallbackStaffId;
  const rows: HistoryRow[] = [
    { fromStatus: null, toStatus: 'NEW', changedById: ticket.requesterId, note: 'Ticket created', createdAt: ticket.createdAt },
  ];
  const path = STATUS_PATHS[ticket.currentStatus];
  const resolvedIndex = path.findIndex(([, to]) => to === 'RESOLVED');
  const start = ticket.createdAt.getTime();
  const resolvedAt =
    timeline.resolvedDaysAgo !== undefined ? daysAgo(timeline.resolvedDaysAgo).getTime() : Date.now() - 30 * 60 * 1000;
  const preSteps = resolvedIndex >= 0 ? resolvedIndex + 1 : path.length;

  path.forEach(([from, to], i) => {
    let at: number;
    if (i < preSteps) {
      at = start + ((resolvedAt - start) * (i + 1)) / preSteps;
    } else {
      at = resolvedAt + Math.min(DAY_MS, (Date.now() - resolvedAt) / 2);
    }
    const note =
      to === 'RESOLVED' ? timeline.resolutionSummary ?? null
      : to === 'REOPENED' ? timeline.reopenReason ?? null
      : to === 'CANCELLED' ? 'Duplicate request; cancelled by the requester.'
      : null;
    const changedById = to === 'CANCELLED' && from === 'NEW' ? ticket.requesterId : staffId;
    rows.push({ fromStatus: from, toStatus: to, changedById, note, createdAt: new Date(at) });
  });
  return rows;
}

type SeedAction = {
  clientRequestId: string;
  ticket: { number: string } | { key: string };
  /** Position between ticket creation (0) and now (1), so actionAt is never before the ticket (BR-03). */
  at: number;
  description: string;
  result?: string;
  status: ActionTakenStatus;
  assigneeId: number;
  createdById: number;
  followUpNote?: string;
  attachmentNotes?: string;
  cancelReason?: string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, SALT_ROUNDS);
  console.log('🌱 Starting Lab 3 seed...\n');

  // -- 1. Categories ---------------------------------------------------------
  console.log('Seeding categories...');
  for (const name of categories) {
    const cat = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    console.log(`  ✔ Category [${cat.id}]: ${cat.name}`);
  }

  // -- 2. Related Systems -----------------------------------------------------
  console.log('\nSeeding related systems...');
  for (const rs of relatedSystems) {
    const sys = await prisma.relatedSystem.upsert({
      where:  { name: rs.name },
      update: {},
      create: rs,
    });
    console.log(`  ✔ RelatedSystem [${sys.id}]: ${sys.name}`);
  }

  // -- 3. Users ---------------------------------------------------------------
  console.log('\nSeeding users...');
  const userMap = new Map<string, number>(); // email → id
  for (const u of users) {
    const created = await prisma.user.upsert({
      where:  { email: u.email },
      update: {},                        // do not overwrite if already seeded
      create: {
        name:               u.name,
        email:              u.email,
        passwordHash,
        role:               u.role,
        isActive:           u.isActive,
        mustChangePassword: true,
      },
    });
    userMap.set(u.email, created.id);
    console.log(`  ✔ User [${created.id}] (${created.role}): ${created.name} <${created.email}> ${created.isActive ? '🟢' : '🔴'}`);
  }

  // Helper ids
  const jenniferID  = userMap.get('jennifer.anderson@toktickit.com')!;
  const davidID     = userMap.get('david.lee@toktickit.com')!;
  const sarahID     = userMap.get('sarah.johnson@toktickit.com')!;
  const emilyID     = userMap.get('emily.davis@toktickit.com')!;
  const michaelID   = userMap.get('michael.brown@toktickit.com')!;
  const alexID      = userMap.get('alex.thompson@toktickit.com')!;
  const lisaID      = userMap.get('lisa.martinez@toktickit.com')!;
  const kevinID     = userMap.get('kevin.patel@toktickit.com')!;

  // -- 4. Tickets (requires Category & RelatedSystem ids) -------------------
  console.log('\nSeeding tickets...');

  const catId = async (name: string) =>
    (await prisma.category.findUnique({ where: { name } }))!.id;
  const sysId = async (name: string) =>
    (await prisma.relatedSystem.findUnique({ where: { name } }))!.id;

  const ticketDefs = [
    {
      ticketNumber:      'TKT-2026-000001',
      requesterId:       jenniferID,
      categoryName:      'Account and Access',
      systemName:        'Email',
      summary:           'Cannot access my university email account',
      description:       'Since yesterday morning I am unable to log in to my email. Password reset did not help.',
      requestedPriority: 'HIGH'   as const,
      itPriority:        'HIGH'   as const,
      currentStatus:     'IN_PROGRESS' as const,
      ticketOwnerId:     michaelID,
    },
    {
      ticketNumber:      'TKT-2026-000002',
      requesterId:       davidID,
      categoryName:      'Network',
      systemName:        'Campus Wi-Fi',
      summary:           'Wi-Fi drops every 10 minutes in Building B',
      description:       'The campus Wi-Fi in Building B, 3rd floor, disconnects repeatedly. This has been happening for 3 days.',
      requestedPriority: 'MEDIUM' as const,
      itPriority:        'MEDIUM' as const,
      currentStatus:     'OPEN' as const,
      ticketOwnerId:     alexID,
    },
    {
      ticketNumber:      'TKT-2026-000003',
      requesterId:       sarahID,
      categoryName:      'Software',
      systemName:        'LEB2 App',
      summary:           'LEB2 app crashes when submitting assignment',
      description:       'Every time I try to upload a PDF assignment on LEB2 the app crashes with a white screen.',
      // BR-11: itPriority is initialized to requestedPriority at creation,
      // regardless of whether the ticket has been claimed yet.
      requestedPriority: 'HIGH'   as const,
      itPriority:        'HIGH'   as const,
      currentStatus:     'NEW'    as const,
      ticketOwnerId:     null,
    },
    {
      ticketNumber:      'TKT-2026-000004',
      requesterId:       emilyID,
      categoryName:      'Hardware',
      systemName:        'Corporate Laptop',
      summary:           'Laptop keyboard has two keys that stopped working',
      description:       "The 'E' and 'R' keys on my laptop stopped responding. External keyboard works fine.",
      requestedPriority: 'LOW'    as const,
      itPriority:        'LOW'    as const,
      currentStatus:     'WAITING_FOR_REQUESTER' as const,
      ticketOwnerId:     lisaID,
    },
    {
      ticketNumber:      'TKT-2026-000005',
      requesterId:       jenniferID,
      categoryName:      'Network',
      systemName:        'VPN',
      summary:           'VPN client fails to connect from off-campus',
      description:       'VPN connection hangs at authentication step when connecting from home. On campus it works fine.',
      requestedPriority: 'MEDIUM' as const,
      itPriority:        'MEDIUM' as const,
      currentStatus:     'RESOLVED' as const,
      ticketOwnerId:     michaelID,
      requesterResolvedIndicator: false, // BR-15: cleared on resolve
    },
    {
      ticketNumber:      'TKT-2026-000006',
      requesterId:       davidID,
      categoryName:      'Software',
      systemName:        'Grade Submission App',
      summary:           'Grade submission form returns 500 error',
      description:       'When trying to finalise grade submission the system shows a 500 internal server error.',
      requestedPriority: 'HIGH'   as const,
      itPriority:        'HIGH'   as const,
      currentStatus:     'CLOSED' as const,
      ticketOwnerId:     alexID,
      requesterResolvedIndicator: false, // BR-15: cleared on resolve
    },
    {
      ticketNumber:      'TKT-2026-000007',
      requesterId:       sarahID,
      categoryName:      'Account and Access',
      systemName:        'VPN',
      summary:           'VPN account expired — unable to renew online',
      description:       'My VPN account expired last week. The self-service renewal portal is returning a permissions error.',
      // BR-11: itPriority is initialized to requestedPriority at creation.
      requestedPriority: 'MEDIUM' as const,
      itPriority:        'MEDIUM' as const,
      currentStatus:     'NEW'    as const,
      ticketOwnerId:     null,
    },
    {
      ticketNumber:      'TKT-2026-000008',
      requesterId:       emilyID,
      categoryName:      'Hardware',
      systemName:        'Printer',
      summary:           'Printer in Room 204 offline — cannot print documents',
      description:       'The printer in Room 204 shows as offline on all computers. Last known working: Monday.',
      requestedPriority: 'LOW'    as const,
      itPriority:        'LOW'    as const,
      currentStatus:     'REOPENED' as const,
      ticketOwnerId:     lisaID,
    },
  ];

  // Lab 4 — when each Lab 3 ticket was created / resolved, plus its resolution text, so a fresh
  // database gets a consistent createdAt, resolvedAt (BR-15) and status history (BR-17).
  // Existing databases keep their rows untouched (upsert update: {}).
  const lab3Timelines: Record<string, Timeline> = {
    'TKT-2026-000001': { createdDaysAgo: 3 },
    'TKT-2026-000002': { createdDaysAgo: 4 },
    'TKT-2026-000003': { createdDaysAgo: 1 },
    'TKT-2026-000004': { createdDaysAgo: 6 },
    'TKT-2026-000005': {
      createdDaysAgo: 5, resolvedDaysAgo: 2,
      resolutionSummary: 'Pushed a corrected VPN profile; off-campus connection verified with the requester.',
    },
    'TKT-2026-000006': {
      createdDaysAgo: 20, resolvedDaysAgo: 12,
      resolutionSummary: 'Hotfix deployed to grade-submission service v3.1.1; submission verified end to end.',
    },
    'TKT-2026-000007': { createdDaysAgo: 0.5 },
    'TKT-2026-000008': {
      createdDaysAgo: 15, resolvedDaysAgo: 9,
      resolutionSummary: 'Replaced the toner cartridge; printer came back online.',
      reopenReason: 'Printer went offline again the next morning.',
    },
  };

  const ticketMap = new Map<string, number>(); // ticketNumber → id
  const timelineById = new Map<number, Timeline>();
  for (const t of ticketDefs) {
    const { categoryName, systemName, ...rest } = t;
    const timeline = lab3Timelines[t.ticketNumber];
    const ticket = await prisma.ticket.upsert({
      where:  { ticketNumber: t.ticketNumber },
      update: {},
      create: {
        ...rest,
        ...timelineFields(t.currentStatus, timeline),
        requesterResolvedIndicator: t.requesterResolvedIndicator ?? false,
        categoryId:     await catId(categoryName),
        relatedSystemId: await sysId(systemName),
      },
    });
    ticketMap.set(ticket.ticketNumber, ticket.id);
    timelineById.set(ticket.id, timeline);
    console.log(`  ✔ Ticket [${ticket.id}] ${ticket.ticketNumber}: "${ticket.summary}" (${ticket.currentStatus})`);
  }

  // Lab 4 additions. Their numbers come from the normal generator, so they are looked up by
  // requester + summary instead of a fixed ticket number: earlier test runs may already hold
  // TKT-2026-000009 onwards in a shared database.
  const lab4TicketDefs: (SeedTicket & Timeline)[] = [
    {
      key: 'cancelled', requesterId: sarahID, categoryName: 'Hardware', systemName: 'Corporate Laptop',
      summary: 'Request to cancel duplicate monitor order',
      description: 'I submitted the monitor request twice by mistake. Please cancel this one; the other request is the correct one.',
      requestedPriority: 'LOW', currentStatus: 'CANCELLED', ticketOwnerId: null,
      createdDaysAgo: 9,
    },
    {
      key: 'resolvable', requesterId: davidID, categoryName: 'Software', systemName: 'Email',
      summary: 'Outlook freezes when opening shared calendar',
      description: 'Outlook stops responding for about a minute whenever I open the department shared calendar.',
      requestedPriority: 'MEDIUM', currentStatus: 'IN_PROGRESS', ticketOwnerId: alexID,
      requesterResolvedIndicator: true,
      createdDaysAgo: 5,
    },
    {
      key: 'urgentUnassigned', requesterId: emilyID, categoryName: 'Hardware', systemName: 'Corporate Laptop',
      summary: 'Projector in Lecture Hall 3 shows no signal',
      description: 'My laptop is connected by HDMI but the Lecture Hall 3 projector shows "No signal". Class starts at 13:00.',
      requestedPriority: 'HIGH', currentStatus: 'NEW', ticketOwnerId: null,
      createdDaysAgo: 2,
    },
    {
      key: 'recentlyResolved', requesterId: jenniferID, categoryName: 'Account and Access', systemName: 'Email',
      summary: 'Need access to the department shared drive',
      description: 'I joined the Finance team this week and need read/write access to the department shared drive.',
      requestedPriority: 'MEDIUM', currentStatus: 'RESOLVED', ticketOwnerId: michaelID,
      createdDaysAgo: 3, resolvedDaysAgo: 1,
      resolutionSummary: 'Added the requester to the Finance-Share security group; access confirmed.',
    },
  ];

  const lab4TicketIds = new Map<string, number>(); // key → id
  for (const t of lab4TicketDefs) {
    let ticket = await prisma.ticket.findFirst({ where: { requesterId: t.requesterId, summary: t.summary } });
    if (!ticket) {
      ticket = await prisma.ticket.create({
        data: {
          ticketNumber:      await getNextTicketNumber(prisma),
          requesterId:       t.requesterId,
          categoryId:        await catId(t.categoryName),
          relatedSystemId:   await sysId(t.systemName),
          summary:           t.summary,
          description:       t.description,
          requestedPriority: t.requestedPriority,
          itPriority:        t.requestedPriority, // Lab 3 BR-11
          currentStatus:     t.currentStatus,
          ticketOwnerId:     t.ticketOwnerId,
          requesterResolvedIndicator: t.requesterResolvedIndicator ?? false,
          ...timelineFields(t.currentStatus, t),
        },
      });
      console.log(`  ✔ Ticket [${ticket.id}] ${ticket.ticketNumber}: "${ticket.summary}" (${ticket.currentStatus})`);
    } else {
      console.log(`  • Ticket "${t.summary}" already exists as ${ticket.ticketNumber}, skipping`);
    }
    lab4TicketIds.set(t.key, ticket.id);
    timelineById.set(ticket.id, t);
  }

  // -- 5. Public Comments ----------------------------------------------------
  console.log('\nSeeding public comments...');
  type CommentDef = { ticketNumber: string; authorId: number; content: string };
  const commentDefs: CommentDef[] = [
    {
      ticketNumber: 'TKT-2026-000001',
      authorId:     michaelID,
      content:      'Hi Jennifer, I have reset your email account authentication token. Please try logging in again and let me know if the issue persists.',
    },
    {
      ticketNumber: 'TKT-2026-000001',
      authorId:     jenniferID,
      content:      'Thank you Michael! I can now access my email again.',
    },
    {
      ticketNumber: 'TKT-2026-000002',
      authorId:     alexID,
      content:      "David, we've identified a misconfigured access point on that floor. A technician will be on-site within 2 hours.",
    },
    {
      ticketNumber: 'TKT-2026-000004',
      authorId:     lisaID,
      content:      'Emily, could you confirm whether the issue started after a software update or physical damage?',
    },
    {
      ticketNumber: 'TKT-2026-000005',
      authorId:     michaelID,
      content:      'Jennifer, the VPN configuration update has been pushed. Please reconnect and let us know if it is now working.',
    },
    {
      ticketNumber: 'TKT-2026-000005',
      authorId:     jenniferID,
      content:      'Confirmed — VPN is now working from home. Thank you!',
    },
  ];

  for (const c of commentDefs) {
    const ticketId = ticketMap.get(c.ticketNumber);
    if (!ticketId) continue;
    // No natural unique key on PublicComment — guard idempotency with an
    // existence check instead (findFirst + skip) so re-running the seed
    // never duplicates append-only comment rows.
    const existing = await prisma.publicComment.findFirst({
      where: { ticketId, authorId: c.authorId, content: c.content },
    });
    if (existing) {
      console.log(`  • PublicComment on ${c.ticketNumber} by authorId=${c.authorId} already exists, skipping`);
      continue;
    }
    await prisma.publicComment.create({
      data: { ticketId, authorId: c.authorId, content: c.content },
    });
    console.log(`  ✔ PublicComment on ${c.ticketNumber} by authorId=${c.authorId}`);
  }

  // -- 6. Internal Notes -------------------------------------------------------
  console.log('\nSeeding internal notes...');
  type NoteDef = { ticketNumber: string; authorId: number; content: string };
  const noteDefs: NoteDef[] = [
    {
      ticketNumber: 'TKT-2026-000001',
      authorId:     michaelID,
      content:      'Root cause: OAuth token corruption in the identity store. Applied hot-fix on auth server v2.4.1.',
    },
    {
      ticketNumber: 'TKT-2026-000002',
      authorId:     alexID,
      content:      "AP firmware is three versions behind. Scheduled maintenance window for tonight 22:00–23:00.",
    },
    {
      ticketNumber: 'TKT-2026-000006',
      authorId:     alexID,
      content:      'Bug was in the grade-submission service v3.1.0. Hotfix deployed at 14:30. Monitoring for 48 h before closing.',
    },
    {
      ticketNumber: 'TKT-2026-000008',
      authorId:     lisaID,
      content:      'First attempt: replaced toner — still offline. Second visit needed: suspect driver corruption.',
    },
  ];

  for (const n of noteDefs) {
    const ticketId = ticketMap.get(n.ticketNumber);
    if (!ticketId) continue;
    // Same idempotency guard as Public Comments — see above.
    const existing = await prisma.internalNote.findFirst({
      where: { ticketId, authorId: n.authorId, content: n.content },
    });
    if (existing) {
      console.log(`  • InternalNote on ${n.ticketNumber} by authorId=${n.authorId} already exists, skipping`);
      continue;
    }
    await prisma.internalNote.create({
      data: { ticketId, authorId: n.authorId, content: n.content },
    });
    console.log(`  ✔ InternalNote on ${n.ticketNumber} by authorId=${n.authorId}`);
  }

  // -- 7. Status history (Lab 4, BR-17) ---------------------------------------
  // Only tickets with no history at all get one: tickets that existed before the Lab 4 migration
  // already carry their migrated snapshot row, and history is never rewritten.
  console.log('\nSeeding status history...');
  for (const [ticketId, timeline] of timelineById) {
    if ((await prisma.ticketStatusChange.count({ where: { ticketId } })) > 0) {
      console.log(`  • Ticket [${ticketId}] already has status history, skipping`);
      continue;
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const rows = buildHistory(ticket, timeline, michaelID);
    await prisma.ticketStatusChange.createMany({ data: rows.map((r) => ({ ...r, ticketId })) });
    console.log(`  ✔ Ticket [${ticketId}] history: ${rows.map((r) => r.toStatus).join(' → ')}`);
  }

  // -- 8. Actions Taken (Lab 4) -------------------------------------------------
  // Covers spec §7.6: 0 actions (000002, 000003, 000007, cancelled, urgentUnassigned), 1 action
  // (000004, 000005, recentlyResolved), and 4 actions by three staff on 000001 whose owner is
  // Michael (BR-02). The open action on 000001 blocks resolution (BR-14); "resolvable" has only
  // completed actions; 000008 keeps an open action assigned to the inactive Kevin (BR-06).
  console.log('\nSeeding actions taken...');
  const actionDefs: SeedAction[] = [
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000001', ticket: { number: 'TKT-2026-000001' }, at: 0.2,
      status: 'COMPLETED', assigneeId: michaelID, createdById: michaelID,
      description: 'Reset the OAuth token for the account in the identity store.',
      result: 'Requester can sign in again on web and mobile.',
      followUpNote: 'Watch sign-in logs for 48 hours to confirm the token fix holds.',
      attachmentNotes: 'Sign-in log export auth-log-0001.csv is on the shared IT drive under /tickets/000001.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000002', ticket: { number: 'TKT-2026-000001' }, at: 0.4,
      status: 'COMPLETED', assigneeId: alexID, createdById: michaelID,
      description: 'Re-synced the mailbox to the new token on the Exchange server.',
      result: 'Mail delivery resumed; a backlog of 14 messages was delivered.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000003', ticket: { number: 'TKT-2026-000001' }, at: 0.5,
      status: 'CANCELLED', assigneeId: lisaID, createdById: lisaID,
      description: "Reinstall the mobile mail client on the requester's phone.",
      cancelReason: 'Not needed: the token reset fixed the mobile client too.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000004', ticket: { number: 'TKT-2026-000001' }, at: 0.7,
      status: 'PLANNED', assigneeId: alexID, createdById: michaelID,
      description: 'Apply auth server patch v2.4.2 during the Friday maintenance window.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000005', ticket: { number: 'TKT-2026-000004' }, at: 0.5,
      status: 'COMPLETED', assigneeId: lisaID, createdById: lisaID,
      description: 'Ran the keyboard diagnostics tool on the laptop.',
      result: "The 'E' and 'R' keys report no signal; hardware fault confirmed. Waiting for the requester to bring the laptop in.",
      attachmentNotes: 'Diagnostics screenshot: see attachment kbd-diag.png on this ticket if uploaded.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000006', ticket: { number: 'TKT-2026-000005' }, at: 0.4,
      status: 'COMPLETED', assigneeId: michaelID, createdById: michaelID,
      description: 'Pushed a corrected VPN profile to the requester\'s laptop.',
      result: 'VPN connects from home in under 10 seconds.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000007', ticket: { number: 'TKT-2026-000006' }, at: 0.2,
      status: 'COMPLETED', assigneeId: alexID, createdById: alexID,
      description: 'Reproduced the 500 error and traced it to grade-submission service v3.1.0.',
      result: 'Null pointer in the rounding module identified.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000008', ticket: { number: 'TKT-2026-000006' }, at: 0.3,
      status: 'COMPLETED', assigneeId: alexID, createdById: alexID,
      description: 'Deployed hotfix v3.1.1 and resubmitted the grades with the requester.',
      result: 'Grades submitted successfully.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000009', ticket: { number: 'TKT-2026-000008' }, at: 0.3,
      status: 'COMPLETED', assigneeId: lisaID, createdById: lisaID,
      description: 'Replaced the toner cartridge.',
      result: 'Printer printed a test page, then went offline again the next morning.',
      followUpNote: 'Driver corruption suspected; reinstall the driver on the print server.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000010', ticket: { number: 'TKT-2026-000008' }, at: 0.8,
      status: 'IN_PROGRESS', assigneeId: kevinID, createdById: lisaID,
      description: 'Reinstall the printer driver on the print server.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000011', ticket: { key: 'resolvable' }, at: 0.3,
      status: 'COMPLETED', assigneeId: alexID, createdById: alexID,
      description: 'Cleared the Outlook cache and rebuilt the mail profile.',
      result: 'Calendar opens, but still slowly (about 20 seconds).',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000012', ticket: { key: 'resolvable' }, at: 0.6,
      status: 'COMPLETED', assigneeId: michaelID, createdById: alexID,
      description: 'Repaired the delegate permissions on the department shared calendar.',
      result: 'Shared calendar opens instantly; requester confirmed by comment.',
    },
    {
      clientRequestId: 'a4b0c001-0000-4000-8000-000000000013', ticket: { key: 'recentlyResolved' }, at: 0.4,
      status: 'COMPLETED', assigneeId: michaelID, createdById: michaelID,
      description: 'Added the requester to the Finance-Share security group.',
      result: 'Requester can read and write the shared drive.',
    },
  ];

  for (const a of actionDefs) {
    const ticketId = 'number' in a.ticket ? ticketMap.get(a.ticket.number) : lab4TicketIds.get(a.ticket.key);
    if (!ticketId) continue;
    const exists = await prisma.actionTaken.findUnique({
      where: { ticketId_clientRequestId: { ticketId, clientRequestId: a.clientRequestId } },
    });
    if (exists) {
      console.log(`  • ActionTaken ${a.clientRequestId} already exists, skipping`);
      continue;
    }
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const start = ticket.createdAt.getTime();
    const actionAt = new Date(start + (Date.now() - start) * a.at);
    const completed = a.status === 'COMPLETED';
    await prisma.actionTaken.create({
      data: {
        ticketId,
        clientRequestId:  a.clientRequestId,
        actionAt,
        description:      a.description,
        result:           a.result ?? null,
        status:           a.status,
        assigneeId:       a.assigneeId,
        // BR-05: the performer is whoever completed it; seeded completions are by the assignee.
        performedById:    completed ? a.assigneeId : null,
        completedAt:      completed ? actionAt : null,
        createdById:      a.createdById,
        lastUpdatedById:  completed ? a.assigneeId : a.createdById,
        followUpRequired: Boolean(a.followUpNote),
        followUpNote:     a.followUpNote ?? null,
        attachmentNotes:  a.attachmentNotes ?? null,
        cancelReason:     a.cancelReason ?? null,
      },
    });
    console.log(`  ✔ ActionTaken on ticket [${ticketId}] (${a.status}): ${a.description}`);
  }

  console.log('\n✅ Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
