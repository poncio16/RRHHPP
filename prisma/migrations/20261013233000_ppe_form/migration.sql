-- Formulario de entrega de ropa de trabajo y EPP: descripción del puesto y
-- elementos de protección que requiere, y código postal del establecimiento.
-- AlterTable
ALTER TABLE "position" ADD COLUMN     "job_description" TEXT,
ADD COLUMN     "required_ppe" TEXT;

-- AlterTable
ALTER TABLE "workplace" ADD COLUMN     "postal_code" TEXT;
