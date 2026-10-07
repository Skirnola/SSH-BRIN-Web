"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCameraFrameUrl, getCameraLiveUrl, getDetectionLiveUrl, getSystemHealth } from "@/lib/jetson-api";
import { useWorkspaceAuth } from "./auth-gate";
import { Icon } from "./icon";
import { WorkspaceTour } from "./workspace-tour";

const DETECTION_SCRIPT = "Test19Agus_optimized_fps_big_ui.py";
type View = "detection" | "camera" | "device";

const navigation: { id: View; label: string; icon: "play" | "camera" | "activity" }[] = [
  { id: "detection", label: "Jalankan deteksi", icon: "play" },
  { id: "camera", label: "Kamera", icon: "camera" },
  { id: "device", label: "Kondisi perangkat", icon: "activity" },
];

function StatusDot() {
  return <span className="status-dot" aria-hidden="true" />;
}

export function EdgeWorkspace() {
  const { signOut } = useWorkspaceAuth();
  const [view, setView] = useState<View>("detection");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tourRequest, setTourRequest] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameFailed, setFrameFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [detectionViewerOpen, setDetectionViewerOpen] = useState(false);
  const [viewerMode, setViewerMode] = useState<"image" | "live">("image");
  const [liveSession, setLiveSession] = useState(0);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [detectionSession, setDetectionSession] = useState(0);
  const [detectionRunning, setDetectionRunning] = useState(false);
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const detectionBusy = useRef(false);
  const systemHealth = useQuery({
    queryKey: ["system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrameLoading(true);
      setFrameFailed(false);
      setFrameVersion(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!viewerOpen && !detectionViewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [viewerOpen, detectionViewerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setNotificationsOpen(false);
        setViewerOpen(false);
        setDetectionViewerOpen(false);
        setViewerMode("image");
        setDetectionRunning(false);
        setDetectionLoading(false);
        detectionBusy.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changeView = (next: View) => {
    setView(next);
    setDrawerOpen(false);
  };

  const refreshCameraFrame = () => {
    setFrameLoading(true);
    setFrameFailed(false);
    setFrameVersion(Date.now());
  };

  const closeCameraViewer = () => {
    setViewerOpen(false);
    setViewerMode("image");
    setLiveLoading(false);
  };

  const selectLiveMode = () => {
    setViewerMode("live");
    setLiveLoading(true);
    setLiveFailed(false);
    setLiveSession(Date.now());
  };

  const startDetection = () => {
    if (detectionBusy.current) return;
    detectionBusy.current = true;
    setDetectionLoading(true);
    setDetectionFailed(false);
    setDetectionRunning(true);
    setDetectionSession(Date.now());
    setDetectionViewerOpen(true);
  };

  const stopDetection = () => {
    detectionBusy.current = false;
    setDetectionRunning(false);
    setDetectionLoading(false);
  };

  const closeDetectionViewer = () => {
    stopDetection();
    setDetectionViewerOpen(false);
  };

  const handleTourStepChange = useCallback((step: number | null) => {
    if (step !== null) {
      setView(navigation[step].id);
      setDrawerOpen(false);
    }
  }, []);

  const health = systemHealth.data;
  const updatedLabel = health
    ? new Date(health.updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")
    : "—";
  const uptimeDays = health ? Math.floor(health.jetson.uptime_seconds / 86_400) : null;

  return (
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
      <button className="drawer-scrim" type="button" aria-label="Tutup navigasi" onClick={() => setDrawerOpen(false)} tabIndex={drawerOpen ? 0 : -1} />
      <aside className="sidebar" aria-label="Navigasi ruang kerja">
        <div className="sidebar-brand">
          <div className="brand-lockup">
            <Image className="brand-icon" src="/brin-icon.png" width={48} height={48} alt="Logo BRIN" priority />
            <div className="brand-name"><strong>BRIN</strong><span>Badan Riset dan Inovasi Nasional</span></div>
          </div>
          <button className="sidebar-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="Tutup menu"><Icon name="x" /></button>
        </div>
        <div className="workspace-label">Ruang kerja</div>
        <nav className="workspace-nav" aria-label="Navigasi utama">
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : undefined} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => changeView(item.id)}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={`sidebar-health${systemHealth.isError ? " connection-error" : ""}`}>
          <StatusDot />
          <div><strong>{health ? "Jetson terhubung" : systemHealth.isError ? "Jetson tidak terhubung" : "Memeriksa Jetson…"}</strong><span>{health ? `Diperbarui ${updatedLabel}` : systemHealth.isError ? "Data tidak tersedia" : "Mohon tunggu…"}</span></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-context">
            <button className="icon-button menu-button" type="button" onClick={() => setDrawerOpen(true)} aria-label="Buka navigasi" aria-expanded={drawerOpen}><Icon name="menu" /></button>
            <span className="location-chip">KST Samaun Samadikun</span>
          </div>
          <div className="topbar-actions">
            <button className="tour-launch" type="button" onClick={() => setTourRequest((value) => value + 1)} aria-label="Buka petunjuk"><Icon name="help" /><span>Petunjuk</span></button>
            <div className="notification-wrap">
              <button className="icon-button" type="button" aria-label="Buka notifikasi" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Icon name="bell" /></button>
              {notificationsOpen && <div className="notification-panel" role="status"><strong>{systemHealth.isError ? "Perangkat tidak dapat dijangkau" : "Status perangkat"}</strong><span>{health ? health.camera.status === "online" ? "Kamera dan Jetson terhubung." : "Kamera tidak dapat dijangkau." : "Kondisi perangkat belum tersedia."}</span></div>}
            </div>
            <button className="logout-button" type="button" onClick={() => void signOut()}><Icon name="arrow-right" /> Keluar</button>
          </div>
        </header>

        <main className="content">
          <section className="page-intro" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">Ruang kerja / {navigation.find((item) => item.id === view)?.label}</p>
              <h1 id="page-title">{view === "detection" ? "Deteksi kendaraan" : view === "camera" ? "Kamera area parkir" : "Kondisi perangkat"}</h1>
              <p className="intro-copy">{view === "detection" ? "Jalankan analisis kendaraan di Jetson tanpa membuka berkas atau SSH." : view === "camera" ? "Lihat gambar terbaru atau pantau kamera secara langsung." : "Pantau kesehatan kamera dan Jetson dari satu tempat."}</p>
            </div>
            <span className={`status-label ${health ? "healthy" : "pending"}`}><StatusDot /> {health ? "Jetson terhubung" : systemHealth.isError ? "Jetson tidak terhubung" : "Memeriksa perangkat…"}</span>
          </section>

          {view === "detection" && (
            <section id="tour-detection" className="panel detection-panel" aria-labelledby="detection-title">
              <div className="detection-intro">
                <Image className="detection-photo" src="/Camera1.jpg" width={72} height={72} alt="Kamera area parkir" loading="eager" />
                <div><p className="panel-kicker">Analisis kendaraan · Kamera 01</p><h2 id="detection-title">Jalankan deteksi</h2><p>Video yang sudah dianalisis akan tampil langsung di layar. Tutup tampilan untuk menghentikan proses.</p></div>
              </div>
              <div className="detection-actions">
                <button className="run-button" type="button" onClick={startDetection} disabled={detectionViewerOpen}>
                  <Icon name="play" /> Jalankan deteksi kendaraan
                </button>
                <span>{systemHealth.isError ? "Jetson belum dapat dijangkau. Anda dapat mencoba kembali nanti." : "Satu proses deteksi pada satu waktu."}</span>
              </div>
            </section>
          )}

          {view === "camera" && (
            <section id="tour-camera" className="panel camera-panel camera-workspace" aria-labelledby="camera-title">
              <div className="panel-heading">
                <div><p className="panel-kicker">Frame terbaru</p><h2 id="camera-title">Tampilan kamera</h2></div>
                <div className="camera-actions">
                  <button className="refresh-button" type="button" onClick={refreshCameraFrame} aria-label="Perbarui frame kamera"><Icon name="refresh" className={frameLoading ? "spinning" : undefined} /></button>
                  <button className="refresh-button expand-button" type="button" onClick={() => { setViewerMode("image"); setViewerOpen(true); }} aria-label="Perbesar tampilan kamera"><Icon name="maximize" /></button>
                </div>
              </div>
              <div className="camera-frame">
                {/* Frame is proxied by FastAPI; the browser never receives RTSP credentials. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameFailed ? "/Camera1.jpg" : getCameraFrameUrl(frameVersion)} alt={frameFailed ? "Foto perangkat Kamera 1" : "Frame terbaru Kamera 1"} loading="lazy" onLoad={() => setFrameLoading(false)} onError={() => { setFrameLoading(false); setFrameFailed(true); }} />
                {frameLoading && <div className="frame-state"><Icon name="refresh" className="spinning" /> Mengambil frame…</div>}
                {frameFailed && <div className="frame-badge warning">Frame langsung belum tersedia</div>}
                {!frameLoading && !frameFailed && <div className="frame-badge"><StatusDot /> Frame aktual</div>}
              </div>
              <dl className="camera-details"><div><dt>Sumber</dt><dd>Camera 01</dd></div><div><dt>Alamat</dt><dd>{health?.camera.ip ?? "—"}</dd></div></dl>
              <div className="result-source"><Icon name="camera" /> Diperbarui otomatis setiap 30 detik · tanpa deteksi</div>
              <button className="camera-live-button" type="button" onClick={() => { setViewerOpen(true); selectLiveMode(); }}><Icon name="video" /> Buka Real-Time Cam</button>
            </section>
          )}

          {view === "device" && (
            <section id="tour-device" className="panel health-panel device-workspace" aria-labelledby="health-title">
              <div className="panel-heading">
                <div><h2 id="health-title">Kondisi perangkat</h2><span className="updated-time">{health ? `Diperbarui ${updatedLabel}` : systemHealth.isError ? "Data tidak tersedia" : "Mengambil data nyata…"}</span></div>
                <button className="refresh-button" type="button" onClick={() => void systemHealth.refetch()} aria-label="Perbarui kondisi perangkat"><Icon name="refresh" className={systemHealth.isFetching ? "spinning" : undefined} /></button>
              </div>
              <div className={`overall-status${!health || health.camera.status === "offline" || health.jetson.status === "warning" ? " warning" : ""}`}>
                <Icon name={health?.camera.status === "online" ? "check" : "x"} />
                {health ? health.camera.status === "online" ? "Kamera dan Jetson terhubung" : "Kamera tidak dapat dijangkau" : systemHealth.isError ? "Kondisi perangkat tidak tersedia" : "Memeriksa perangkat…"}
              </div>
              <article className="device-block">
                <div className="device-title"><div className="device-identity"><Image className="device-photo" src="/Camera1.jpg" width={42} height={42} alt="Kamera 1" /><div><strong>CAM-01</strong><span>Kamera area parkir</span></div></div><span className={`status-label ${health?.camera.status === "online" ? "active" : "pending"}`}>{health?.camera.status === "online" ? "Terhubung" : health ? "Offline" : "Belum tersedia"}</span></div>
                <dl className="metrics"><div><dt>Alamat IP</dt><dd>{health?.camera.ip ?? "—"}</dd></div><div><dt>Latensi</dt><dd>{health?.camera.latency_ms != null ? `${health.camera.latency_ms.toFixed(1)} ms` : "—"}</dd></div><div><dt>Jaringan</dt><dd>{health?.camera.status === "online" ? "Aktif" : "—"}</dd></div></dl>
              </article>
              <article className="device-block">
                <div className="device-title"><div className="device-identity"><Image className="device-photo" src="/Jetson.jpg" width={42} height={42} alt="NVIDIA Jetson" /><div><strong>{health?.jetson.id.toUpperCase() ?? "TEGRA-UBUNTU"}</strong><span>Komputer edge · uptime {uptimeDays != null ? `${uptimeDays} hari` : "—"}</span></div></div><span className={`status-label ${health?.jetson.status === "healthy" ? "healthy" : "pending"}`}>{health?.jetson.status === "healthy" ? "Sehat" : health ? "Peringatan" : "Belum tersedia"}</span></div>
                <dl className="metrics"><div><dt>GPU</dt><dd>{health ? `${health.jetson.gpu_percent}%` : "—"}</dd></div><div><dt>Suhu</dt><dd>{health ? `${health.jetson.temperature_c.toFixed(1)}°C` : "—"}</dd></div><div><dt>Memori</dt><dd>{health ? `${(health.jetson.memory_used_mb / 1024).toFixed(1)} / ${(health.jetson.memory_total_mb / 1024).toFixed(1)} GB` : "—"}</dd></div></dl>
                <div className="storage-meter"><div><span>Penyimpanan</span><strong>{health ? `${health.jetson.storage_percent}%` : "—"}</strong></div><div className="meter-track"><span style={{ width: `${health?.jetson.storage_percent ?? 0}%` }} /></div></div>
              </article>
            </section>
          )}
        </main>
      </div>

      {viewerOpen && (
        <section className="camera-viewer" role="dialog" aria-modal="true" aria-labelledby="camera-viewer-title">
          <header className="camera-viewer-header"><div className="viewer-camera-name"><Image className="viewer-device-photo" src="/Camera1.jpg" width={44} height={44} alt="" /><div><span>Kamera 01 · {health?.camera.ip ?? "alamat belum tersedia"}</span><h2 id="camera-viewer-title">Area parkir BRIN</h2></div></div><div className="viewer-controls"><div className="viewer-mode-switch" aria-label="Mode tampilan kamera"><button type="button" className={viewerMode === "image" ? "active" : undefined} aria-pressed={viewerMode === "image"} onClick={() => { setViewerMode("image"); setLiveLoading(false); }}><Icon name="image" /> Gambar</button><button type="button" className={viewerMode === "live" ? "active" : undefined} aria-pressed={viewerMode === "live"} onClick={selectLiveMode}><Icon name="video" /> Real-Time Cam</button></div><button className="viewer-close" type="button" onClick={closeCameraViewer} aria-label="Tutup tampilan kamera"><Icon name="x" /></button></div></header>
          <div className="camera-viewer-stage">{viewerMode === "image" ? (
            <div className="viewer-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frameFailed ? "/Camera1.jpg" : getCameraFrameUrl(frameVersion)} alt={frameFailed ? "Foto perangkat Kamera 1" : "Frame besar terbaru Kamera 1"} onLoad={() => setFrameLoading(false)} onError={() => { setFrameLoading(false); setFrameFailed(true); }} />
              {frameLoading && <div className="viewer-media-state"><Icon name="refresh" className="spinning" /><strong>Mengambil gambar terbaru…</strong></div>}
              <div className="viewer-overlay-label"><Icon name="image" /> Diperbarui setiap 30 detik</div>
            </div>
          ) : (
            <div className="viewer-media live-media">
              {!liveFailed && (
                // MJPEG streaming requires an unoptimized native image element.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={getCameraLiveUrl(liveSession)} alt="Real-Time Cam Kamera 1" onLoad={() => setLiveLoading(false)} onError={() => { setLiveLoading(false); setLiveFailed(true); }} />
              )}
              {liveLoading && <div className="viewer-media-state"><Icon name="refresh" className="spinning" /><strong>Menyiapkan Real-Time Cam…</strong><span>Stream utama kualitas tinggi dapat memerlukan waktu hingga 60 detik.</span></div>}
              {liveFailed && <div className="viewer-media-state error"><Icon name="x" /><strong>Real-Time Cam tidak tersedia</strong><span>Coba kembali ke mode Gambar atau sambungkan ulang.</span><button type="button" onClick={selectLiveMode}>Sambungkan ulang</button></div>}
              {!liveLoading && !liveFailed && <div className="viewer-overlay-label live"><StatusDot /> Real-Time Cam · Channel 101 HD</div>}
            </div>
          )}</div>
          <footer className="camera-viewer-footer"><span><StatusDot /> {health?.camera.status === "online" ? "Kamera terhubung" : "Status kamera belum tersedia"}</span><span>Tekan Esc untuk menutup</span></footer>
        </section>
      )}

      {detectionViewerOpen && (
        <section className="camera-viewer detection-viewer" role="dialog" aria-modal="true" aria-labelledby="detection-viewer-title">
          <header className="camera-viewer-header"><div className="viewer-camera-name"><Image className="viewer-device-photo" src="/Camera1.jpg" width={44} height={44} alt="Kamera area parkir" /><div><span>Analisis kamera 01</span><h2 id="detection-viewer-title">Deteksi kendaraan</h2></div></div><div className="viewer-controls">{detectionRunning && !detectionLoading && !detectionFailed && <span className="detection-running-status"><StatusDot /> Berjalan di Jetson</span>}<button className="viewer-close" type="button" onClick={closeDetectionViewer} aria-label="Tutup deteksi"><Icon name="x" /></button></div></header>
          <div className="camera-viewer-stage">{detectionRunning ? (
            <div className="viewer-media detection-media">
              {!detectionFailed && (
                // MJPEG streaming requires an unoptimized native image element.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={getDetectionLiveUrl(DETECTION_SCRIPT, detectionSession)} alt="Deteksi kendaraan langsung" onLoad={() => setDetectionLoading(false)} onError={() => { setDetectionLoading(false); setDetectionFailed(true); }} />
              )}
              {detectionLoading && <div className="viewer-media-state"><Icon name="refresh" className="spinning" /><strong>Memuat model dan memulai deteksi…</strong><span>Proses pertama pada Jetson dapat memerlukan lebih dari satu menit.</span></div>}
              {detectionFailed && <div className="viewer-media-state error"><Icon name="x" /><strong>Deteksi tidak dapat dijalankan</strong><span>Pastikan kamera tersedia dan tidak ada proses deteksi lain yang sedang aktif.</span><button type="button" onClick={stopDetection}>Kembali</button></div>}
              {!detectionLoading && !detectionFailed && <div className="viewer-overlay-label live"><StatusDot /> Deteksi langsung</div>}
              <button className="stop-detection-button" type="button" onClick={stopDetection}><Icon name="x" /> Hentikan deteksi</button>
            </div>
          ) : (
            <div className="detection-stopped"><span className="detection-symbol"><Icon name="activity" /></span><p className="panel-kicker">Proses dihentikan</p><h3>Deteksi telah berhenti</h3><p>Analisis kendaraan tidak lagi berjalan pada Jetson.</p><div><button className="start-detection-button" type="button" onClick={startDetection}><Icon name="play" /> Jalankan kembali</button><button className="secondary-detection-button" type="button" onClick={closeDetectionViewer}>Tutup</button></div></div>
          )}</div>
          <footer className="camera-viewer-footer"><span><StatusDot /> {detectionRunning ? detectionFailed ? "Deteksi gagal dimulai" : detectionLoading ? "Memulai deteksi…" : "Deteksi berjalan" : "Deteksi dihentikan"}</span><span>Menutup tampilan akan menghentikan proses</span></footer>
        </section>
      )}
      <WorkspaceTour request={tourRequest} onStepChange={handleTourStepChange} />
    </div>
  );
}
