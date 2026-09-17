import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

const categories = [
  'Account and Access',
  'Hardware',
  'Software',
  'Network',
];

const relatedSystems = [
  'Email',
  'Campus Wi-Fi',
  'VPN',
  'LEB2 App',
  'Grade Submission App',
  'Corporate Laptop',
  'Printer',
];

const requesters = [
  { name: 'Jennifer Anderson', email: 'jennifer.anderson@example.com', isActive: true },
  { name: 'Michael Chen', email: 'michael.chen@example.com', isActive: true },
  { name: 'Sofia Ramirez', email: 'sofia.ramirez@example.com', isActive: true },
  { name: 'David Okafor', email: 'david.okafor@example.com', isActive: true },
  { name: 'Priya Natarajan', email: 'priya.natarajan@example.com', isActive: false },
];

async function main() {
  console.log('Seeding categories into database...');
  for (const name of categories) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`- Seeded category [id: ${category.id}]: ${category.name}`);
  }
  console.log('Categories seeded successfully.');

  console.log('Seeding related systems into database...');
  for (const name of relatedSystems) {
    const relatedSystem = await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
    console.log(`- Seeded related system [id: ${relatedSystem.id}]: ${relatedSystem.name}`);
  }
  console.log('Related systems seeded successfully.');

  console.log('Seeding development requesters into database...');
  for (const { name, email, isActive } of requesters) {
    const requester = await prisma.requesterUser.upsert({
      where: { email },
      update: {},
      create: { name, email, isActive },
    });
    console.log(
      `- Seeded requester [id: ${requester.id}]: ${requester.name} (${requester.isActive ? 'active' : 'inactive'})`,
    );
  }
  console.log('Development requesters seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
