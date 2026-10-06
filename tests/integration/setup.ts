import "dotenv/config";

// Los módulos del servidor leen DATABASE_URL: en tests apunta a la base de test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
