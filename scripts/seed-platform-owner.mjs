/**
 * Seed the first platform OWNER.
 *
 * Usage:
 *   PLATFORM_OWNER_EMAIL=you@company.com PLATFORM_OWNER_PASSWORD='long-random' npx tsx scripts/seed-platform-owner.mjs
 *
 * Optional: PLATFORM_OWNER_NAME="Ops"
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), override: true });

const email = String(process.env.PLATFORM_OWNER_EMAIL || '').trim().toLowerCase();
const password = String(process.env.PLATFORM_OWNER_PASSWORD || '');
const name = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';

if (!email || !password || password.length < 12) {
  console.error(
    'Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD (min 12 chars) before seeding.'
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const main = async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.platformUser.findUnique({ where: { email } });

  if (existing) {
    const updated = await prisma.platformUser.update({
      where: { email },
      data: {
        passwordHash,
        name,
        role: 'OWNER',
        status: 'ACTIVE'
        // Keep existing MFA enrollment
      }
    });
    console.log(`Updated platform OWNER ${updated.email} (id=${updated.id}). MFA enabled=${updated.mfaEnabled}`);
  } else {
    const created = await prisma.platformUser.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'OWNER',
        status: 'ACTIVE',
        mfaEnabled: false
      }
    });
    console.log(`Created platform OWNER ${created.email} (id=${created.id}). Enroll MFA on first login.`);
  }
};

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
