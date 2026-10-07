import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const e2ePassword = process.env.BRIN_E2E_PASSWORD;

async function signIn(page: Page, dismissTour = true) {
  await page.goto("/");
  await page.getByLabel("Nama pengguna").fill("admin");
  await page.getByLabel("Kata sandi").fill(e2ePassword ?? "");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Deteksi kendaraan", level: 1 })).toBeVisible({ timeout: 20_000 });
  if (dismissTour) {
    const skip = page.getByRole("button", { name: "Lewati", exact: true });
    await skip.waitFor({ state: "visible", timeout: 2_500 }).then(() => skip.click()).catch(() => undefined);
  }
}

test("menampilkan tiga fungsi tanpa berkas dan hanya menjalankan deteksi terbaru", async ({ page }) => {
  const preview = await readFile(new URL("../public/Camera1.jpg", import.meta.url));
  const requestedScripts: string[] = [];
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { username: "admin" } }));
  await page.route("**/api/v1/system/health", (route) => route.fulfill({ json: {
    camera: { id: "CAM-01", ip: "10.21.1.92", status: "online", latency_ms: 9 },
    jetson: { id: "tegra-ubuntu", status: "healthy", gpu_percent: 22, temperature_c: 47, memory_used_mb: 2000, memory_total_mb: 8000, storage_percent: 30, uptime_seconds: 86400 },
    updated_at: new Date().toISOString(),
  } }));
  await page.route("**/api/v1/cameras/main/frame?**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: preview }));
  await page.route("**/api/v1/detection/live?**", (route) => {
    requestedScripts.push(new URL(route.request().url()).searchParams.get("script") ?? "");
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: preview });
  });
  await page.addInitScript(() => localStorage.setItem("brin-workspace-tour-v2", "complete"));
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Navigasi utama" });
  await expect(navigation.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Penjelajah berkas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Jalankan deteksi kendaraan" }).click();
  await expect(page.getByRole("dialog", { name: "Deteksi kendaraan" }).getByRole("img", { name: "Deteksi kendaraan langsung" })).toBeVisible();
  await expect.poll(() => requestedScripts).toEqual(["Test19Agus_optimized_fps_big_ui.py"]);
  await page.getByRole("button", { name: "Tutup deteksi" }).click();
  await navigation.getByRole("button", { name: "Kamera" }).click();
  await expect(page.getByText("Frame aktual")).toBeVisible();
  await navigation.getByRole("button", { name: "Kondisi perangkat" }).click();
  await expect(page.getByText("10.21.1.92")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "Jalankan deteksi" }).click();
  await expect(page.getByRole("heading", { name: "Deteksi kendaraan", level: 1 })).toBeVisible();
  await expect(page.locator(".app-shell")).not.toHaveClass(/drawer-open/);
  await page.getByRole("button", { name: "Buka petunjuk" }).click();
  await expect(page.getByRole("dialog", { name: "Jalankan deteksi" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kamera parkir" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kondisi perangkat" })).toBeVisible();
  await page.getByRole("button", { name: "Selesai" }).click();
});

test("melindungi workspace dengan halaman masuk", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deteksi kendaraan", level: 1 })).toHaveCount(0);
});

test("menampilkan petunjuk tiga langkah hanya pada kunjungan pertama", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await signIn(page, false);
  await expect(page.getByRole("dialog", { name: "Jalankan deteksi" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kamera parkir" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kondisi perangkat" })).toBeVisible();
  await page.getByRole("button", { name: "Selesai" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deteksi kendaraan", level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("Petunjuk 1 dari 3")).toHaveCount(0);
});

test("menampilkan kondisi dan frame kamera nyata", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await signIn(page);
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("button", { name: "Kondisi perangkat" }).click();
  await expect(page.getByText("Kamera dan Jetson terhubung")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("10.21.1.92").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("button", { name: "Kamera" }).click();
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

test("menjalankan deteksi yang ditetapkan tanpa menampilkan file", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  const preview = await readFile(new URL("../public/Camera1.jpg", import.meta.url));
  await page.route("**/api/v1/detection/live?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: preview });
  });
  await signIn(page);
  await expect(page.getByRole("navigation", { name: "Penjelajah berkas" })).toHaveCount(0);
  await expect(page.getByText("Test19Agus_optimized_fps_big_ui.py")).toHaveCount(0);
  await page.getByRole("button", { name: "Jalankan deteksi kendaraan" }).click();

  const detectionViewer = page.getByRole("dialog", { name: "Deteksi kendaraan" });
  await expect(detectionViewer).toBeVisible();
  await expect(detectionViewer.getByLabel("Script pada Jetson")).toHaveCount(0);
  await expect(detectionViewer.getByRole("img", { name: "Deteksi kendaraan langsung" })).toBeVisible();
  await detectionViewer.getByRole("button", { name: "Tutup deteksi" }).click();
  await expect(detectionViewer).toBeHidden();
});

test("membuka tiga menu pada layar seluler", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.getByRole("button", { name: "Buka navigasi", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Navigasi utama" });
  await expect(navigation.getByRole("button")).toHaveCount(3);
  await navigation.getByRole("button", { name: "Kondisi perangkat" }).click();
  await expect(page.getByRole("heading", { name: "Kondisi perangkat", level: 1 })).toBeVisible();
});
