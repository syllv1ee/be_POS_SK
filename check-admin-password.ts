import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import * as pg from "pg";

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    const user = await prisma.user.findUnique({
      where: { username: "admin" },
      select: {
        id: true,
        username: true,
        is_active: true,
        password: true,
      },
    });

    if (!user) {
      console.log("HASIL: akun admin tidak ditemukan di database seeder.");
      return;
    }

    console.log("ID:", user.id);
    console.log("Username:", user.username);
    console.log("Aktif:", user.is_active);
    console.log(
      "Password cocok:",
      await bcrypt.compare("password", user.password),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
