-- Subidas directas del navegador al almacenamiento, pendientes de asociarse a
-- un documento. Son filas técnicas: se consumen al guardar el formulario y las
-- que nadie usó se borran junto con su archivo (nunca quedó en un registro).
-- CreateTable
CREATE TABLE "pending_upload" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "max_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_upload_storage_key_key" ON "pending_upload"("storage_key");

-- CreateIndex
CREATE INDEX "pending_upload_created_at_idx" ON "pending_upload"("created_at");

-- AddForeignKey
ALTER TABLE "pending_upload" ADD CONSTRAINT "pending_upload_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

