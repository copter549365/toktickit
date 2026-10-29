// Lab 4 recovery step (docs/lab-04/specification.md §7.5): take a pg_dump of the database before
// applying a migration. Runs pg_dump inside the docker-compose `db` container, so no local
// PostgreSQL client is needed.
//
//   npm run db:backup                     → backups/toktickit-<timestamp>.dump
//
// Restore (replaces the current contents of the database):
//   docker compose exec -T db pg_restore -U toktickit_user -d toktickit_db --clean --if-exists < backups/<file>.dump
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = new URL(
  process.env.DATABASE_URL ?? 'postgresql://toktickit_user:toktickit_password@localhost:5432/toktickit_db',
);
const user = decodeURIComponent(url.username);
const database = url.pathname.replace(/^\//, '');

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dir = path.resolve('backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `toktickit-${stamp}.dump`);

const out = fs.createWriteStream(file);
const dump = spawn('docker', ['compose', 'exec', '-T', 'db', 'pg_dump', '-U', user, '-Fc', database], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
dump.stdout.pipe(out);
dump.on('close', (code) => {
  out.close();
  if (code !== 0) {
    fs.rmSync(file, { force: true });
    console.error(`pg_dump failed (exit ${code}); no backup written.`);
    process.exit(code ?? 1);
  }
  console.log(`Backup written to ${path.relative(process.cwd(), file)}`);
});
