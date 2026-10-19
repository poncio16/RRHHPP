import { expect, test, type Page } from "@playwright/test";

/*
 * Flujos de humo: login, alta de un legajo con su foto, licencia, egreso y
 * su rastro en la auditoría. Cada corrida usa datos nuevos (DNI al azar) y no
 * depende de lo que ya haya en la base, salvo los catálogos del seed.
 */

/** DNI al azar y su CUIL válido (prefijo 20). */
function randomPerson() {
  for (;;) {
    const dni = String(40_000_000 + Math.floor(Math.random() * 9_000_000));
    const base = `20${dni}`;
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    const check = 11 - (sum % 11);
    if (check !== 10) return { dni, cuil: `${base}${check === 11 ? 0 : check}` };
  }
}

/** Hoy en Argentina, como AAAA-MM-DD. */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

/** Imagen PNG de 1 × 1 píxel. */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test.describe("sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirige al login y rechaza credenciales inválidas", async ({ page }) => {
    await page.goto("/empleados");
    await expect(page).toHaveURL(/\/login$/);
    // Un email que no existe: no suma intentos fallidos a ninguna cuenta real.
    await page.locator("#email").fill(`nadie-${Date.now()}@ejemplo.com`);
    await page.locator("#password").fill("una-clave-cualquiera");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  });

  test("las rutas de datos piden sesión y las respuestas llevan cabeceras de seguridad", async ({ request }) => {
    expect((await request.get("/api/exportar/empleados")).status()).toBe(401);
    expect((await request.get("/api/empleados/00000000-0000-7000-8000-000000000000/foto")).status()).toBe(401);
    const headers = (await request.get("/login")).headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("same-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe.serial("ciclo de un legajo", () => {
  const person = randomPerson();
  const lastName = "Prueba E2E";
  const firstName = `Legajo ${person.dni}`;
  let employeeUrl = "";

  test("alta de un empleado", async ({ page }) => {
    await page.goto("/empleados/nuevo");
    await page.locator("#lastName").fill(lastName);
    await page.locator("#firstName").fill(firstName);
    await page.locator("#dni").fill(person.dni);
    await page.locator("#cuil").fill(person.cuil);
    await page.locator("#birthDate").fill("1990-05-10");
    await page.locator("#sex").selectOption("F");
    await page.locator("#addressLine").fill("Calle Ficticia 123");
    await page.locator("#city").fill("San Miguel de Tucumán");
    await page.locator("#provinceId").selectOption({ label: "Tucumán" });
    await page.locator("#postalCode").fill("4000");
    await page.locator("#hireDate").fill("2020-02-03");
    await page.locator("#contractTypeId").selectOption({ label: "Tiempo indeterminado" });
    await page.locator("#positionId").selectOption({ index: 1 });
    await page.locator("#departmentId").selectOption({ index: 1 });
    await page.locator("#workplaceId").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Crear legajo" }).click();

    await page.waitForURL(/\/empleados\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${lastName}, ${firstName}`);
    employeeUrl = new URL(page.url()).pathname;
  });

  test("foto del legajo desde el celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(employeeUrl);
    await page.getByRole("button", { name: "Cargar una foto" }).click();
    const dialog = page.getByRole("dialog");
    // "Sacar foto" abre la cámara del celular; acá se le pasa la imagen a ese mismo campo.
    await dialog.locator("input[capture]").setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1X1, "base64"),
    });
    await dialog.getByRole("button", { name: "Guardar foto" }).click();
    await expect(dialog).toBeHidden();
    const photo = page.locator(`img[alt="Foto de ${firstName} ${lastName}"]`);
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Cambiar la foto" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);

    // Se sirve como imagen (siempre JPEG, achicada en el navegador) y se revalida con el ETag.
    const url = new URL((await photo.getAttribute("src"))!, page.url()).href;
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-cache",
    });
    const etag = response.headers()["etag"]!;
    expect((await page.request.get(url, { headers: { "If-None-Match": etag } })).status()).toBe(304);
    expect((await page.request.get(url, { headers: { "If-None-Match": `W/${etag}` } })).status()).toBe(304);
    expect((await page.request.get(url, { headers: { "If-None-Match": '"otra"' } })).status()).toBe(200);
  });

  test("el DNI repetido se rechaza", async ({ page }) => {
    await page.goto("/empleados/nuevo");
    await page.locator("#lastName").fill(lastName);
    await page.locator("#firstName").fill("Duplicado");
    await page.locator("#dni").fill(person.dni);
    await page.locator("#cuil").fill(person.cuil);
    await page.locator("#birthDate").fill("1990-05-10");
    await page.locator("#sex").selectOption("F");
    await page.locator("#addressLine").fill("Calle Ficticia 123");
    await page.locator("#city").fill("San Miguel de Tucumán");
    await page.locator("#provinceId").selectOption({ label: "Tucumán" });
    await page.locator("#postalCode").fill("4000");
    await page.locator("#hireDate").fill("2020-02-03");
    await page.locator("#contractTypeId").selectOption({ label: "Tiempo indeterminado" });
    await page.locator("#positionId").selectOption({ index: 1 });
    await page.locator("#departmentId").selectOption({ index: 1 });
    await page.locator("#workplaceId").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Crear legajo" }).click();
    await expect(page.locator("#dni-error")).toBeVisible();
    await expect(page).toHaveURL(/\/empleados\/nuevo$/);
  });

  test("licencia registrada como aprobada", async ({ page }) => {
    await page.goto(`${employeeUrl}/licencias`);
    await page.getByRole("button", { name: "Nuevo registro" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#leave-type").selectOption({ label: "Enfermedad" });
    await dialog.locator("#leave-start").fill(today);
    await dialog.locator("#leave-end").fill(today);
    await dialog.locator("#leave-approve").check();
    await dialog.getByRole("button", { name: "Registrar aprobada" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("tbody tr").filter({ hasText: "Enfermedad" }).filter({ visible: true })).toHaveCount(1);
  });

  test("formulario de entrega de EPP para imprimir", async ({ page }) => {
    await page.goto(employeeUrl);
    const link = page.getByRole("link", { name: "Formulario de EPP" });
    await expect(link).toHaveAttribute("target", "_blank");
    await page.goto(`${employeeUrl}/formulario-epp`);
    const sheet = page.getByRole("region", {
      name: "Formulario de entrega de ropa de trabajo y elementos de protección personal",
    });
    await expect(sheet).toContainText(`Nombre y apellido del trabajador: ${lastName}, ${firstName}`);
    await expect(sheet).toContainText(`D.N.I.: ${person.dni}`);
    await expect(sheet.locator("tbody tr")).toHaveCount(18);
    // Al imprimir solo sale la hoja, en una página A4 apaisada.
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Imprimir" })).toBeHidden();
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox\s*\[\s*0 0 841\.\d+ 59[45]\.\d+\s*\]/);
    // Al volver al legajo, la regla de impresión del formulario ya no oculta la aplicación.
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("link", { name: "Volver al legajo" }).click();
    await page.waitForURL(employeeUrl);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { name: `${lastName}, ${firstName}` })).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("egreso confirmado sin borrar el legajo", async ({ page }) => {
    await page.goto(`${employeeUrl}/historial`);
    await page.getByRole("button", { name: "Registrar egreso" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#exit-date").fill(today);
    await dialog.locator("#exit-type").selectOption({ index: 1 });
    await dialog.locator("#exit-reason").selectOption({ index: 1 });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Registrar y confirmar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Egresado", { exact: true }).first()).toBeVisible();

    // Sigue en la base, como egresado.
    await page.goto(`/empleados?status=egresados&q=${person.dni}`);
    await expect(page.getByRole("link", { name: `${lastName}, ${firstName}` }).first()).toBeVisible();

    // Ya no se le arma el formulario de EPP.
    await page.goto(employeeUrl);
    await expect(page.getByRole("link", { name: "Formulario de EPP" })).toHaveCount(0);
    await page.goto(`${employeeUrl}/formulario-epp`);
    await expect(page.getByText("El empleado está egresado")).toBeVisible();
  });

  test("el alta queda en la auditoría", async ({ page }) => {
    await page.goto(`/auditoria?q=${encodeURIComponent(`${lastName}, ${firstName}`)}&accion=CREATE`);
    await expect(page.getByText(`${lastName}, ${firstName}`).first()).toBeVisible();
  });
});

test("las pantallas principales no se desbordan en el celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/empleados", "/licencias", "/novedades", "/reportes", "/auditoria"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await noHorizontalScroll(page), path).toBe(true);
  }
});

test("el inicio muestra los backups y lleva a sus parámetros", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();
  // En la instalación de producción de CI ya corrieron backups y pruebas de restauración que fallan a propósito.
  if (process.env.E2E_BACKUPS_FALLIDOS) {
    await expect(page.getByText("Revisá los backups")).toBeVisible();
    await expect(page.getByText(/La última prueba de restauración falló/)).toBeVisible();
  }
  await page.getByRole("link", { name: "Parámetros → Backups" }).click();
  await expect(page.locator("#backups")).toBeInViewport();
});
