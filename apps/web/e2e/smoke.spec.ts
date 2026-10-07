import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const e2ePassword = process.env.BRIN_E2E_PASSWORD;
const detectionScript = "Test19Agus_optimized_fps_big_ui.py";

async function signIn(page: Page, dismissTour = true) {
  await page.goto("/");
  await page.getByLabel("Nama pengguna").fill("admin");
  await page.getByLabel("Kata sandi").fill(e2ePassword ?? "");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Pemantauan kendaraan", level: 1 })).toBeVisible({ timeout: 20_000 });
  if (dismissTour) {
    const skip = page.getByRole("button", { name: "Lewati", exact: true });
    await skip.waitFor({ state: "visible", timeout: 2_500 }).then(() => skip.click()).catch(() => undefined);
  }
}

async function mockDashboard(page: Page) {
  const preview = await readFile(new URL("../public/Camera1.jpg", import.meta.url));
  const requestedScripts: string[] = [];
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { username: "admin" } }));
  await page.route("**/api/v1/system/health", (route) => route.fulfill({ json: {
    camera: { id: "CAM-01", ip: "10.21.1.92", status: "online", latency_ms: 9 },
    jetson: { id: "tegra-ubuntu", status: "healthy", gpu_percent: 22, temperature_c: 47, memory_used_mb: 2000, memory_total_mb: 8000, storage_percent: 30, uptime_seconds: 86400 },
    updated_at: new Date().toISOString(),
  } }));
  await page.route("**/api/v1/cameras/main/frame?**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: preview }));
  await page.route("**/api/v1/cameras/main/live?**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: preview }));
  await page.route("**/api/v1/detection/live?**", (route) => {
    requestedScripts.push(new URL(route.request().url()).searchParams.get("script") ?? "");
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: preview });
  });
  await page.addInitScript(() => localStorage.setItem("brin-workspace-tour-v3", "complete"));
  return requestedScripts;
}

async function expectSingleDashboard(page: Page) {
  await page.mouse.move(10, 180);
  await expect(page.getByRole("heading", { name: "Pemantauan kendaraan", level: 1 })).toBeVisible();
  for (const title of ["Jalankan deteksi", "Kamera", "Kondisi perangkat"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator("aside, nav, .code-viewer, .file-tree")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buka navigasi", exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar").getByRole("img", { name: "Logo BRIN" })).toBeVisible();
  await expect(page.locator(".topbar-brand").getByText("BRIN", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCSS("background-color", "rgb(6, 62, 109)");
  await expect(page.locator(".topbar-brand")).toHaveCSS("background-color", "rgb(6, 62, 109)");
  for (const label of ["Buka petunjuk", "Buka notifikasi", "Keluar"]) {
    await expect(page.locator(".topbar").getByRole("button", { name: label })).toHaveCSS("color", "rgb(243, 248, 252)");
  }
  await expect(page.locator(".topbar-brand strong")).toHaveCSS("color", "rgb(255, 255, 255)");
  const illustration = page.getByRole("img", { name: "Ilustrasi deteksi kendaraan di area parkir", exact: true });
  await expect(illustration).toHaveAttribute("src", "/vehicle-detection.svg");
  await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Frame aktual", { exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar").getByText("Badan Riset dan Inovasi Nasional")).toBeVisible();
  await expect(page.locator(".topbar-brand")).toHaveCSS("border-radius", "0px");
  const brandBounds = await page.locator(".topbar-brand").boundingBox();
  expect(brandBounds?.x).toBe(0);
  await expect(page.getByText(detectionScript)).toHaveCount(0);
}

async function expectCameraFrame(page: Page, timeout = 5_000) {
  const frame = page.getByRole("img", { name: "Frame terbaru Kamera 1", exact: true });
  await expect(frame).toBeVisible({ timeout });
  await expect.poll(() => frame.evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout }).toBeGreaterThan(0);
  await expect(page.locator(".camera-frame .frame-state")).toHaveCount(0);
}

// Credential-free tests mock API responses only in the test browser.
// Production authentication and hardware access are never bypassed.
test("menggabungkan tiga panel tanpa sidebar dan menjalankan deteksi yang ditetapkan", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requestedScripts = await mockDashboard(page);
  await page.goto("/");
  await expectSingleDashboard(page);
  await expectCameraFrame(page);
  await expect(page.getByText("Kamera dan Jetson terhubung", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true, animations: "disabled" });
  const logout = page.getByRole("button", { name: "Keluar" });
  await logout.hover();
  await expect(logout).toHaveCSS("color", "rgb(255, 255, 255)");
  await logout.focus();
  await expect(logout).toHaveCSS("outline-style", "solid");
  await page.getByRole("button", { name: "Buka notifikasi" }).click();
  await expect(page.locator(".notification-panel strong")).toHaveCSS("color", "rgb(21, 34, 44)");
  await expect(page.locator(".notification-panel")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await page.mouse.move(600, 200);

  await page.getByRole("button", { name: "Jalankan deteksi kendaraan" }).click();
  const detectionViewer = page.getByRole("dialog", { name: "Deteksi kendaraan" });
  await expect(detectionViewer.getByRole("img", { name: "Deteksi kendaraan langsung" })).toBeVisible();
  await expect.poll(() => requestedScripts).toEqual([detectionScript]);
  await detectionViewer.getByRole("button", { name: "Hentikan deteksi" }).click();
  await expect(detectionViewer.getByText("Deteksi telah berhenti")).toBeVisible();
  await detectionViewer.getByRole("button", { name: "Jalankan kembali" }).click();
  await expect.poll(() => requestedScripts.length).toBe(2);
  await page.keyboard.press("Escape");
  await expect(detectionViewer).toBeHidden();

  await page.getByRole("button", { name: "Buka Real-Time Cam" }).click();
  const cameraViewer = page.getByRole("dialog", { name: "Area parkir BRIN" });
  await expect(cameraViewer.getByRole("button", { name: "Real-Time Cam" })).toHaveAttribute("aria-pressed", "true");
  await expect(cameraViewer.getByRole("img", { name: "Real-Time Cam Kamera 1" })).toBeVisible();
  await expect(cameraViewer.getByRole("button", { name: "Deteksi", exact: true })).toHaveCount(0);
  await cameraViewer.getByRole("button", { name: "Gambar" }).click();
  await page.keyboard.press("Escape");
  await expect(cameraViewer).toBeHidden();
  await expectSingleDashboard(page);
});

test("menumpuk semua panel di seluler tanpa navigasi dan memandu tiap panel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto("/");
  await expectSingleDashboard(page);
  await expectCameraFrame(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Buka petunjuk" }).click();
  await expect(page.getByRole("dialog", { name: "Jalankan deteksi" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kamera parkir" })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await expect(page.getByRole("dialog", { name: "Kondisi perangkat" })).toBeVisible();
  const target = await page.locator("#tour-device").boundingBox();
  expect(target?.y).toBeGreaterThanOrEqual(0);
  expect(target?.y).toBeLessThan(844);
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  await expectSingleDashboard(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("dashboard solid tetap berfungsi dengan reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockDashboard(page);
  await page.goto("/");
  await expectSingleDashboard(page);
  await expect(page.locator(".panel").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".camera-frame img")).toHaveCSS("filter", "none");
  await page.getByRole("button", { name: "Jalankan deteksi kendaraan" }).click();
  await expect(page.getByRole("dialog", { name: "Deteksi kendaraan" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("menampilkan kegagalan perangkat tanpa menghilangkan panel", async ({ page }) => {
  await mockDashboard(page);
  await page.route("**/api/v1/system/health", (route) => route.fulfill({ status: 503, json: { detail: "Kondisi perangkat tidak dapat dibaca" } }));
  await page.route("**/api/v1/cameras/main/frame?**", (route) => route.fulfill({ status: 503 }));
  await page.goto("/");
  await expectSingleDashboard(page);
  await expect(page.getByText("Frame langsung belum tersedia", { exact: true })).toBeVisible();
  await expect(page.getByText("Kondisi perangkat tidak tersedia", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("melindungi dashboard dengan halaman masuk", async ({ page }) => {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ status: 401 }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pemantauan kendaraan", level: 1 })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Pemantauan kendaraan", level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("Petunjuk 1 dari 3")).toHaveCount(0);
});

test("menampilkan kondisi dan frame kamera nyata pada satu halaman", async ({ page }) => {
  test.skip(!e2ePassword, "BRIN_E2E_PASSWORD diperlukan untuk pengujian workspace");
  await signIn(page);
  await expect(page.getByText("Kamera dan Jetson terhubung", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("10.21.1.92").first()).toBeVisible();
  await expectCameraFrame(page, 30_000);
  await page.getByRole("button", { name: "Perbesar tampilan kamera" }).click();
  const viewer = page.getByRole("dialog", { name: "Area parkir BRIN" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Gambar" })).toHaveAttribute("aria-pressed", "true");
  await viewer.getByRole("button", { name: "Real-Time Cam" }).click();
  await expect(viewer.getByRole("img", { name: "Real-Time Cam Kamera 1" })).toBeAttached();
  await viewer.getByRole("button", { name: "Gambar" }).click();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});
