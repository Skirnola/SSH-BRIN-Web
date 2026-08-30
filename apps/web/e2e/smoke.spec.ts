import { expect, test } from "@playwright/test";

test("menampilkan kondisi dan frame kamera nyata", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Selamat pagi, Iqbal." })).toBeVisible();
  await expect(page.getByText("Kamera dan Jetson terhubung")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("10.21.20.52")).toBeVisible();
  await expect(page.getByText("Frame aktual")).toBeVisible({ timeout: 30_000 });
});

test("membuka navigasi berkas pada layar seluler", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Buka navigasi berkas" }).click();
  await expect(page.getByRole("navigation", { name: "Penjelajah berkas" })).toBeVisible();
  await expect(page.getByText("BRIN RI NDIP")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Deteksi.py" }).click();
  await expect(page.locator("#file-title")).toHaveText("Deteksi.py");
  await expect(page.getByLabel("Isi berkas Deteksi.py").locator("code")).toBeVisible({ timeout: 15_000 });
});
