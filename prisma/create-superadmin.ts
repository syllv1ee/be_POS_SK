import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import * as pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const username = "Superadmin";
  const password = "superadmin123";

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });

  if (existing) {
    console.log(`Username ${username} sudah ada. Tidak ada perubahan.`);
    return;
  }

  const role = await prisma.role.findUnique({
    where: { id: 1 },
    select: { id: true, name: true },
  });

  if (!role) {
    throw new Error("Role Super Admin dengan ID 1 tidak ditemukan.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: passwordHash,
      name: "Superadmin",
      role_id: role.id,
      employee_id: null,
      is_active: true,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: { select: { id: true, name: true } },
      is_active: true,
    },
  });

  console.log("Akun baru berhasil dibuat:");
  console.log(user);
}

main()
  .catch((error) => {
    console.error("Gagal membuat akun:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
