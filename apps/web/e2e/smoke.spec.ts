import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const e2ePassword = process.env.BRIN_E2E_PASSWORD;

async function signIn(page: Page, dismissTour = true) {
  await page.goto("/");
  await page.getByLabel("Nama pengguna").fill("admin");
  await page.getByLabel("Kata sandi").fill(e2ePassword ?? "");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Selamat Datang, Admin." })).toBeVisible({ timeout: 20_000 });
  if (dismissTour) {
    const skip = page.getByRole("button", { name: "Lewati", exact: true });
    await skip.waitFor({ state: "visible", timeout: 2_500 }).then(() => skip.click()).catch(() => undefined);
  }
}

test("melindungi workspace dengan halaman masuk", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Selamat Datang, Admin." })).toHaveCount(0);
});

test("menampilkan petunjuk tiga langkah hanya pada kunjungan pertama", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await signIn(page, false);
  await expect(page.getByRole("dialog", { name: "Berkas workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kode dan jalankan deteksi" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Tampilan kamera" })).toBeVisible();
  await page.getByRole("button", { name: "Selesai" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Selamat Datang, Admin." })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("Petunjuk 1 dari 3")).toHaveCount(0);
});

test("menampilkan kondisi dan frame kamera nyata", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await signIn(page);
  await expect(page.getByText("Kamera dan Jetson terhubung")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("10.21.20.52").first()).toBeVisible();
  await expect(page.getByText("Frame aktual")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Perbesar tampilan kamera" }).click();
  const viewer = page.getByRole("dialog", { name: "Area parkir BRIN" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Gambar" })).toHaveAttribute("aria-pressed", "true");

  await viewer.getByRole("button", { name: "Real-Time Cam" }).click();
  await expect(viewer.getByRole("img", { name: "Real-Time Cam Kamera 1" })).toBeAttached();
  await expect(viewer.getByText("Menyiapkan Real-Time Cam…")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Deteksi", exact: true })).toHaveCount(0);

  await viewer.getByRole("button", { name: "Gambar" }).click();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("menjalankan script terpilih langsung di tampilan deteksi", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  const preview = await readFile(new URL("../public/Camera1.jpg", import.meta.url));
  await page.route("**/api/v1/detection/live?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: preview });
  });
  await signIn(page);
  await expect(page.getByText("BRIN RI NDIP")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Test19Agus_optimized_fps_big_ui.py", exact: true }).click();
  await expect(page.locator("#file-title")).toHaveText("Test19Agus_optimized_fps_big_ui.py", { timeout: 15_000 });
  await page.getByRole("button", { name: "Jalankan deteksi" }).click();

  const detectionViewer = page.getByRole("dialog", { name: "Deteksi kendaraan" });
  await expect(detectionViewer).toBeVisible();
  await expect(detectionViewer.getByLabel("Script pada Jetson")).toHaveCount(0);
  await expect(detectionViewer.getByRole("img", { name: "Deteksi langsung Test19Agus_optimized_fps_big_ui.py" })).toBeVisible();
  await detectionViewer.getByRole("button", { name: "Tutup deteksi" }).click();
  await expect(detectionViewer).toBeHidden();
});

test("membuka navigasi berkas pada layar seluler", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.getByRole("button", { name: "Buka navigasi berkas" }).click();
  await expect(page.getByRole("navigation", { name: "Penjelajah berkas" })).toBeVisible();
  await expect(page.getByText("BRIN RI NDIP")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Deteksi.py" }).click();
  await expect(page.locator("#file-title")).toHaveText("Deteksi.py");
  await expect(page.getByLabel("Isi berkas Deteksi.py").locator("code")).toBeVisible({ timeout: 15_000 });
});
