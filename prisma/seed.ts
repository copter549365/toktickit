/**
 * prisma/seed.ts — Lab 3 idempotent seed
 *
 * Populates:
 *   - 4 Categories
 *   - 7 Related Systems
 *   - 10 Users  (4 active Requesters, 1 inactive Requester,
 *                3 active IT Staff, 1 inactive IT Staff, 1 Administrator)
 *   - 8 realistic Tickets  (across NEW → CLOSED statuses)
 *   - Sample PublicComments & InternalNotes on active tickets
 *
 * All upserts are keyed on natural/unique columns so the script is
 * safe to run multiple times without creating duplicates.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

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
];

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
      requesterResolvedIndicator: true,
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
      requesterResolvedIndicator: true,
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

  const ticketMap = new Map<string, number>(); // ticketNumber → id
  for (const t of ticketDefs) {
    const { categoryName, systemName, ...rest } = t;
    const ticket = await prisma.ticket.upsert({
      where:  { ticketNumber: t.ticketNumber },
      update: {},
      create: {
        ...rest,
        requesterResolvedIndicator: t.requesterResolvedIndicator ?? false,
        categoryId:     await catId(categoryName),
        relatedSystemId: await sysId(systemName),
      },
    });
    ticketMap.set(ticket.ticketNumber, ticket.id);
    console.log(`  ✔ Ticket [${ticket.id}] ${ticket.ticketNumber}: "${ticket.summary}" (${ticket.currentStatus})`);
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
