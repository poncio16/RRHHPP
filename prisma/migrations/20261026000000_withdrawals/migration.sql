-- Cuentas corrientes de retiros. Cada hoja de las planillas es la cuenta de
-- una persona (se vincula a un legajo si existe). La huella de un movimiento
-- (cuenta, fecha, importes y número de aparición) es única: así una fila que
-- otra planilla arrastra de años anteriores no se carga de nuevo.

-- CreateEnum
CREATE TYPE "AccountEntrySource" AS ENUM ('MANUAL', 'IMPORTACION');

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "employee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_entry" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "concept" TEXT,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_balance" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT NOT NULL,
    "source" "AccountEntrySource" NOT NULL,
    "file_name" TEXT,
    "sheet_name" TEXT,
    "row_number" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ,
    "voided_by_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "account_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_sheet" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" UUID,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_key_key" ON "account"("key");

-- CreateIndex
CREATE INDEX "account_employee_id_idx" ON "account"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_entry_fingerprint_key" ON "account_entry"("fingerprint");

-- CreateIndex
CREATE INDEX "account_entry_account_id_date_idx" ON "account_entry"("account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "account_sheet_key_key" ON "account_sheet"("key");

-- CreateIndex
CREATE INDEX "account_sheet_account_id_idx" ON "account_sheet"("account_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sheet" ADD CONSTRAINT "account_sheet_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sheet" ADD CONSTRAINT "account_sheet_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Importes no negativos y al menos uno de los dos mayor que cero.
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_amounts_check"
    CHECK ("credit" >= 0 AND "debit" >= 0 AND ("credit" > 0 OR "debit" > 0));

-- Un movimiento anulado tiene quién y cuándo.
ALTER TABLE "account_entry" ADD CONSTRAINT "account_entry_void_check"
    CHECK (("voided_at" IS NULL) = ("voided_by_id" IS NULL));
