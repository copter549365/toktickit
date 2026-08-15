import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root or server dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://toktickit_user:toktickit_password@localhost:5432/toktickit_db?schema=public';

const adapter = new PrismaPg({
  connectionString,
});

export const prisma = new PrismaClient({ adapter });
