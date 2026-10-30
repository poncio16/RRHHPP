-- Registro del empleado: con registro (alta en ARCA) o sin registro, cada
-- uno con su fecha. Los legajos existentes quedan con registro y con la
-- fecha de alta en ARCA igual a la de ingreso, como en el alta sin fecha.
-- CreateEnum
CREATE TYPE "EmployeeRegistration" AS ENUM ('CON_REGISTRO', 'SIN_REGISTRO');

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "registered_since" DATE,
ADD COLUMN     "registration" "EmployeeRegistration" NOT NULL DEFAULT 'CON_REGISTRO',
ADD COLUMN     "unregistered_since" DATE;

UPDATE "employee" SET "registered_since" = "hire_date";
