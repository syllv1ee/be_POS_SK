import "dotenv/config";
import { PrismaClient, StockDirection } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import * as pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// "Super Admin" dibuat lebih dulu supaya konsisten dapat id=1 di DB baru —
// PermissionsGuard pakai role.id === 1 sebagai salah satu fallback bypass.
const ROLES = ["Super Admin", "Sales"];

// Master data: default-nya hanya Super Admin (bypass di PermissionsGuard).
const MASTER_PERMISSIONS = [
  "employee:write",
  "market-area:write",
  "vehicle:write",
  "price-type:write",
  "outlet:write",
  "product:write",
  "product-price:write",
  "warehouse:write",
];

// Manajemen akses: user, role, permission.
const ACCESS_PERMISSIONS = [
  "user:read",
  "user:write",
  "role:write",
  "permission:write",
];

// Transaksi kanvas: boleh dikerjakan role Sales.
const TRANSACTION_PERMISSIONS = [
  "sales-kanvas-plan:write",
  "kasbon-product:write",
  "kasbon-operational:write",
  "product-out:write",
  "product-in:write",
  "invoice-outlet:write",
  "invoice-payment:write",
  "invoice-return:write",
];

// Peta role -> daftar izin. Tambah izin baru di sini.
// Super Admin tidak perlu didaftarkan (bypass di PermissionsGuard).
const ROLE_PERMISSIONS: Record<string, string[]> = {
  Sales: [
    ...TRANSACTION_PERMISSIONS,
    "employee:write", // hapus baris ini jika Sales tidak boleh kelola karyawan
  ],
};

// Tipe sumber transaksi gudang (tabel tipe_sumber), sesuai task mentor.
// Kode yang sama boleh dipakai di arah berbeda (unik per arah + kode).
const SOURCE_TYPES: {
  direction: StockDirection;
  code: string;
  name: string;
}[] = [
  // Penerimaan (product in): barang datang dari mana
  { direction: "IN", code: "PRODUKSI", name: "Produksi" },
  { direction: "IN", code: "SALES_KANVAS", name: "Sales Kanvas" },
  { direction: "IN", code: "TOKO", name: "Toko" },
  // Pengeluaran (product out): barang keluar untuk apa / ke mana
  { direction: "OUT", code: "TOKO", name: "Toko" },
  { direction: "OUT", code: "SALES_COUNTER", name: "Sales Counter" },
  { direction: "OUT", code: "SALES_KANVAS", name: "Sales Kanvas" },
];

// Permission lama yang controller-nya sudah tidak ada.
const OBSOLETE_PERMISSIONS = [
  "plan:read",
  "plan:write",
  "kasbon-material-type:write",
];

async function main() {
  // 1) Role
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  // 2) Bersihkan permission lama (relasi permission_role ikut terhapus via cascade).
  await prisma.permission.deleteMany({
    where: { name: { in: OBSOLETE_PERMISSIONS } },
  });

  // 3) Semua permission dibuat, tidak hanya milik Sales.
  const ALL_PERMISSIONS = [
    ...MASTER_PERMISSIONS,
    ...ACCESS_PERMISSIONS,
    ...TRANSACTION_PERMISSIONS,
  ];
  for (const name of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 4) Hubungkan permission ke role sesuai ROLE_PERMISSIONS (tabel permission_role).
  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    for (const name of permNames) {
      const perm = await prisma.permission.findUniqueOrThrow({
        where: { name },
      });
      await prisma.permissionRole.upsert({
        where: {
          permission_id_role_id: { permission_id: perm.id, role_id: role.id },
        },
        update: {},
        create: { permission_id: perm.id, role_id: role.id },
      });
    }
  }

  // 5) Tipe sumber transaksi gudang
  for (const s of SOURCE_TYPES) {
    await prisma.sourceType.upsert({
      where: { direction_code: { direction: s.direction, code: s.code } },
      update: { name: s.name, is_active: true },
      create: { ...s, is_active: true },
    });
  }
  // Sumber yang tidak ada di daftar dinonaktifkan (bukan dihapus), karena
  // masih bisa dipakai transaksi lama. Dropdown hanya menampilkan yang aktif.
  await prisma.sourceType.updateMany({
    where: {
      NOT: {
        OR: SOURCE_TYPES.map((s) => ({
          direction: s.direction,
          code: s.code,
        })),
      },
    },
    data: { is_active: false },
  });

  // 6) User awal (dari .env, ada nilai default).
  const username = process.env.SEED_USERNAME ?? "sales";
  const password = process.env.SEED_PASSWORD ?? "password";
  const roleName = process.env.SEED_ROLE ?? "Sales";

  const role = await prisma.role.findUniqueOrThrow({
    where: { name: roleName },
  });

  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      password: await bcrypt.hash(password, 10),
      name: "Nama Sales Admin",
      role_id: role.id,
    },
  });

  console.log(`Seeded roles: ${ROLES.join(", ")}`);
  console.log(`Seeded permissions: ${ALL_PERMISSIONS.length}`);
  console.log(`Seeded source types: ${SOURCE_TYPES.length}`);
  console.log(`Seeded user: ${user.username} (role: ${roleName})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());