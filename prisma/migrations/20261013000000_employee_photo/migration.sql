-- Foto del legajo: apunta al archivo actual; las fotos anteriores quedan en stored_file.
-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "photo_file_id" UUID;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

