import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Los módulos del servidor leen DATABASE_URL: en tests apunta a la base de test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Los archivos subidos en los tests van a una carpeta temporal.
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "rrhh-storage-"));
