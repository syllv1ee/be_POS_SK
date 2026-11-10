/*
  Warnings:

  - A unique constraint covering the columns `[id_karyawan]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "user_id_karyawan_key" ON "user"("id_karyawan");
