"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getCameraFrameUrl, getSystemHealth, listJetsonFiles, readJetsonFile } from "@/lib/jetson-api";
import type { RemoteFileEntry } from "@/lib/jetson-api";
import type { WorkspaceFile } from "@/lib/mock-data";
import { Icon } from "./icon";

type Props = {
  files: WorkspaceFile[];
  highlightedFiles: Record<string, string>;
};

function StatusDot() {
  return <span className="status-dot" aria-hidden="true" />;
}

const VIEWABLE_SUFFIXES = [".py", ".yaml", ".yml", ".json", ".md", ".txt", ".log"];

function RemoteTreeEntry({
  entry,
  selectedPath,
  onSelect,
}: {
  entry: RemoteFileEntry;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const children = useQuery({
    queryKey: ["jetson-files", entry.path],
    queryFn: () => listJetsonFiles(entry.path),
    enabled: entry.type === "directory" && open,
  });
  const viewable = VIEWABLE_SUFFIXES.some((suffix) => entry.name.toLowerCase().endsWith(suffix));

  if (entry.type === "directory") {
    return (
      <div className="remote-folder">
        <button className="folder-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <Icon name="chevron" className={`chevron${open ? " open" : ""}`} />
          <Icon name="folder" />
          <span>{entry.name}</span>
        </button>
        {open && (
          <div className="folder-files remote-children">
            {children.isPending && <span className="tree-message">Membuka folder…</span>}
            {children.isError && <span className="tree-message error">Folder tidak dapat dibaca</span>}
            {children.data?.entries.map((child) => (
              <RemoteTreeEntry key={child.path} entry={child} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
            {children.data?.entries.length === 0 && <span className="tree-message">Folder kosong</span>}
          </div>
        )}
      </div>
    );
  }

  if (!viewable) {
    return (
      <div className="remote-entry blocked" title="Jenis berkas ini tidak dapat ditampilkan">
        <Icon name="file" />
        <span>{entry.name}</span>
      </div>
    );
  }

  return (
    <button
      className={`file-button remote-file${selectedPath === entry.path ? " active" : ""}`}
      type="button"
      onClick={() => onSelect(entry.path)}
      aria-current={selectedPath === entry.path ? "page" : undefined}
    >
      <Icon name={entry.name.toLowerCase().endsWith(".py") ? "code" : "file"} />
      <span>{entry.name}</span>
    </button>
  );
}

function FileButton({
  file,
  active,
  onSelect,
}: {
  file: WorkspaceFile;
  active: boolean;
  onSelect: (file: WorkspaceFile) => void;
}) {
  return (
    <button
      className={`file-button${active ? " active" : ""}`}
      type="button"
      onClick={() => onSelect(file)}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={file.language === "python" ? "code" : "file"} />
      <span>{file.name}</span>
    </button>
  );
}

export function EdgeWorkspace({ files, highlightedFiles }: Props) {
  const [selectedId, setSelectedId] = useState(files[0].id);
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null);
  const [remoteCode, setRemoteCode] = useState<{ path: string; html: string } | null>(null);
  const [gateOpen, setGateOpen] = useState(true);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("10.42 WIB");
  const [toast, setToast] = useState("");
  const [frameVersion, setFrameVersion] = useState(() => Date.now());
  const [frameLoading, setFrameLoading] = useState(true);
  const [frameFailed, setFrameFailed] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const remoteFiles = useQuery({
    queryKey: ["jetson-files", "root"],
    queryFn: () => listJetsonFiles(),
    refetchInterval: 30_000,
  });
  const systemHealth = useQuery({
    queryKey: ["system-health"],
    queryFn: getSystemHealth,
    refetchInterval: 20_000,
  });
  const remoteFile = useQuery({
    queryKey: ["jetson-file", selectedRemotePath],
    queryFn: () => readJetsonFile(selectedRemotePath!),
    enabled: Boolean(selectedRemotePath),
  });

  const selectedFile = files.find((file) => file.id === selectedId) ?? files[0];
  const gateFiles = files.filter((file) => file.path.includes("kamera-gerbang"));
  const parkingFiles = files.filter((file) => file.path.includes("kamera-parkir"));
  const rootFiles = files.filter((file) => !file.path.includes("kamera-"));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrameLoading(true);
      setFrameFailed(false);
      setFrameVersion(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!remoteFile.data) return;

    const renderCode = async () => {
      const { codeToHtml } = await import("shiki");
      const html = await codeToHtml(remoteFile.data.content, {
        lang: remoteFile.data.language === "log" ? "text" : remoteFile.data.language,
        theme: "github-light-default",
      });
      if (!cancelled) setRemoteCode({ path: remoteFile.data.path, html });
    };
    void renderCode();
    return () => { cancelled = true; };
  }, [remoteFile.data]);

  useEffect(() => {
    const activeTimers = timers.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      activeTimers.forEach(clearTimeout);
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    timers.current.push(setTimeout(() => setToast(""), 3400));
  };

  const selectFile = (file: WorkspaceFile) => {
    setSelectedRemotePath(null);
    setSelectedId(file.id);
    setDrawerOpen(false);
  };

  const selectRemoteFile = (path: string) => {
    setSelectedRemotePath(path);
    setDrawerOpen(false);
  };

  const refreshHealth = () => {
    const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    setUpdatedAt(`${time} WIB`);
    void remoteFiles.refetch();
    void systemHealth.refetch();
    showToast("Kondisi perangkat berhasil diperbarui");
  };

  const refreshCameraFrame = () => {
    setFrameLoading(true);
    setFrameFailed(false);
    setFrameVersion(Date.now());
  };

  const viewingRemote = Boolean(selectedRemotePath);
  const displayPath = selectedRemotePath ?? selectedFile.path;
  const displayName = remoteFile.data?.name ?? selectedRemotePath?.split("/").at(-1) ?? selectedFile.name;
  const displayLanguage = remoteFile.data?.language ?? selectedFile.language;
  const remoteHtml = remoteCode && remoteCode.path === remoteFile.data?.path ? remoteCode.html : "";
  const health = systemHealth.data;
  const updatedLabel = health
    ? new Date(health.updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":")
    : "—";
  const uptimeDays = health ? Math.floor(health.jetson.uptime_seconds / 86_400) : null;

  return (
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
      <button
        className="drawer-scrim"
        type="button"
        aria-label="Tutup navigasi berkas"
        onClick={() => setDrawerOpen(false)}
        tabIndex={drawerOpen ? 0 : -1}
      />

      <aside className="sidebar" aria-label="Navigasi ruang kerja">
        <div className="sidebar-brand">
          <div className="brand-lockup">
            <Image className="brand-icon" src="/brin-icon.png" width={48} height={48} alt="Logo BRIN" priority />
            <div className="brand-name">
              <strong>BRIN</strong>
              <span>Edge Workspace</span>
            </div>
          </div>
          <button className="sidebar-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="Tutup menu">
            <Icon name="x" />
          </button>
        </div>

        <div className="workspace-label">Berkas workspace</div>
        <nav className="file-tree" aria-label="Penjelajah berkas">
          {remoteFiles.data ? (
            <div className="tree-section">
              <div className="tree-root">
                <Icon name="chevron" className="chevron open" />
                <Icon name="folder" />
                <strong>BRIN RI NDIP</strong>
                {remoteFiles.isFetching && <span className="tree-sync">Menyinkronkan…</span>}
              </div>
              <div className="tree-indent remote-tree">
                {remoteFiles.data.entries.map((entry) => (
                  <RemoteTreeEntry
                    key={entry.path}
                    entry={entry}
                    selectedPath={selectedRemotePath}
                    onSelect={selectRemoteFile}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="tree-section">
              <div className="tree-root">
                <Icon name="chevron" className="chevron open" />
                <Icon name="folder" />
                <strong>{remoteFiles.isError ? "Mode contoh" : "Menghubungkan…"}</strong>
              </div>
              <div className="tree-indent">
                <button className="folder-button" type="button" onClick={() => setGateOpen((open) => !open)} aria-expanded={gateOpen}>
                  <Icon name="chevron" className={`chevron${gateOpen ? " open" : ""}`} />
                  <Icon name="folder" />
                  <span>kamera-gerbang</span>
                </button>
                {gateOpen && <div className="folder-files">{gateFiles.map((file) => <FileButton key={file.id} file={file} active={file.id === selectedId} onSelect={selectFile} />)}</div>}
                <button className="folder-button" type="button" onClick={() => setParkingOpen((open) => !open)} aria-expanded={parkingOpen}>
                  <Icon name="chevron" className={`chevron${parkingOpen ? " open" : ""}`} />
                  <Icon name="folder" />
                  <span>kamera-parkir</span>
                </button>
                {parkingOpen && <div className="folder-files">{parkingFiles.map((file) => <FileButton key={file.id} file={file} active={file.id === selectedId} onSelect={selectFile} />)}</div>}
                {rootFiles.map((file) => <FileButton key={file.id} file={file} active={file.id === selectedId} onSelect={selectFile} />)}
              </div>
            </div>
          )}
        </nav>

        <div className={`sidebar-health${remoteFiles.isError ? " connection-error" : ""}`}>
          <StatusDot />
          <div>
            <strong>{remoteFiles.data ? "Jetson terhubung" : remoteFiles.isError ? "Jetson tidak terhubung" : "Menghubungkan ke Jetson"}</strong>
            <span>{remoteFiles.data ? `Sinkron ${updatedAt}` : remoteFiles.isError ? "Menampilkan data contoh" : "Mohon tunggu…"}</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-context">
            <button className="icon-button menu-button" type="button" onClick={() => setDrawerOpen(true)} aria-label="Buka navigasi berkas" aria-expanded={drawerOpen}>
              <Icon name="menu" />
            </button>
            <span className="location-chip">KST Samaun Samadikun</span>
          </div>

          <div className="topbar-actions">
            <span className="current-date">Minggu, 30 Agustus</span>
            <div className="notification-wrap">
              <button
                className="icon-button"
                type="button"
                aria-label="Buka notifikasi"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" />
                <span className="notification-dot" aria-hidden="true" />
              </button>
              {notificationsOpen && (
                <div className="notification-panel" role="status">
                  <strong>Tidak ada peringatan baru</strong>
                  <span>Seluruh node beroperasi normal.</span>
                </div>
              )}
            </div>
            <div className="avatar" aria-label="Pengguna: Iqbal Ramadhan">IR</div>
          </div>
        </header>

        <main className="content">
          <section className="page-intro" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">Ruang kerja / Kamera gerbang</p>
              <h1 id="page-title">Selamat pagi, Iqbal.</h1>
              <p className="intro-copy">Pantau perangkat edge dan jalankan analisis tanpa meninggalkan konteks berkas Anda.</p>
            </div>
            <span className={`status-label ${remoteFiles.data ? "healthy" : "pending"}`}><StatusDot /> {remoteFiles.data ? "Node terhubung" : remoteFiles.isError ? "Node tidak terhubung" : "Menghubungkan…"}</span>
          </section>

          <div className="dashboard-grid">
            <section className="workspace-card" aria-labelledby="file-title">
              <div className="workspace-header">
                <div className="breadcrumbs" aria-label="Lokasi berkas">
                  {displayPath.split("/").map((part, index, parts) => (
                    <span key={`${part}-${index}`} className={index === parts.length - 1 ? "current" : undefined}>
                      {part}{index < parts.length - 1 && <b aria-hidden="true">›</b>}
                    </span>
                  ))}
                </div>
                <span className="read-only"><Icon name="shield" /> Hanya baca</span>
              </div>
              <div className="file-meta">
                <div>
                  <strong id="file-title">{displayName}</strong>
                  <span>{displayLanguage === "python" ? "Python" : displayLanguage === "yaml" ? "YAML" : displayLanguage === "json" ? "JSON" : displayLanguage === "markdown" ? "Markdown" : "Teks"}</span>
                </div>
                <span className="file-policy">Terlindungi oleh kebijakan workspace</span>
              </div>
              <div className="code-viewer" tabIndex={0} aria-label={`Isi berkas ${displayName}`}>
                {viewingRemote ? (
                  remoteFile.isPending ? (
                    <div className="viewer-state"><Icon name="refresh" className="spinning" /><strong>Membaca berkas dari Jetson…</strong><span>Koneksi aman melalui SFTP</span></div>
                  ) : remoteFile.isError ? (
                    <div className="viewer-state error"><Icon name="x" /><strong>Berkas tidak dapat dibuka</strong><span>{remoteFile.error.message}</span></div>
                  ) : remoteHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: remoteHtml }} />
                  ) : (
                    <div className="viewer-state"><Icon name="refresh" className="spinning" /><strong>Menyiapkan tampilan kode…</strong></div>
                  )
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: highlightedFiles[selectedFile.id] }} />
                )}
              </div>
            </section>

            <aside className="right-column" aria-label="Ringkasan perangkat dan kamera">
              <section className="panel health-panel" aria-labelledby="health-title">
                <div className="panel-heading">
                  <div>
                    <h2 id="health-title">Kondisi perangkat</h2>
                    <span className="updated-time">{health ? `Diperbarui ${updatedLabel}` : systemHealth.isError ? "Data tidak tersedia" : "Mengambil data nyata…"}</span>
                  </div>
                  <button className="refresh-button" type="button" onClick={refreshHealth} aria-label="Perbarui kondisi perangkat">
                    <Icon name="refresh" className={systemHealth.isFetching ? "spinning" : undefined} />
                  </button>
                </div>
                <div className={`overall-status${health?.camera.status === "offline" || health?.jetson.status === "warning" ? " warning" : ""}`}>
                  <Icon name={health?.camera.status === "offline" ? "x" : "check"} />
                  {health ? health.camera.status === "online" ? "Kamera dan Jetson terhubung" : "Kamera tidak dapat dijangkau" : "Memeriksa perangkat…"}
                </div>

                <article className="device-block">
                  <div className="device-title">
                    <div className="device-identity">
                      <Image className="device-photo" src="/Camera1.jpg" width={42} height={42} alt="Kamera 1" />
                      <div><strong>CAM-01</strong><span>Kamera area parkir</span></div>
                    </div>
                    <span className={`status-label ${health?.camera.status === "online" ? "active" : "pending"}`}>{health?.camera.status === "online" ? "Terhubung" : health ? "Offline" : "Memeriksa"}</span>
                  </div>
                  <dl className="metrics">
                    <div><dt>Alamat IP</dt><dd>{health?.camera.ip ?? "—"}</dd></div>
                    <div><dt>Latensi</dt><dd>{health?.camera.latency_ms != null ? `${health.camera.latency_ms.toFixed(1)} ms` : "—"}</dd></div>
                    <div><dt>Jaringan</dt><dd>{health?.camera.status === "online" ? "Aktif" : "—"}</dd></div>
                  </dl>
                </article>

                <article className="device-block">
                  <div className="device-title">
                    <div className="device-identity">
                      <Image className="device-photo" src="/Jetson.jpg" width={42} height={42} alt="NVIDIA Jetson" />
                      <div><strong>{health?.jetson.id.toUpperCase() ?? "TEGRA-UBUNTU"}</strong><span>Komputer edge · uptime {uptimeDays != null ? `${uptimeDays} hari` : "—"}</span></div>
                    </div>
                    <span className={`status-label ${health?.jetson.status === "healthy" ? "healthy" : "pending"}`}>{health?.jetson.status === "healthy" ? "Sehat" : health ? "Peringatan" : "Memeriksa"}</span>
                  </div>
                  <dl className="metrics">
                    <div><dt>GPU</dt><dd>{health ? `${health.jetson.gpu_percent}%` : "—"}</dd></div>
                    <div><dt>Suhu</dt><dd>{health ? `${health.jetson.temperature_c.toFixed(1)}°C` : "—"}</dd></div>
                    <div><dt>Memori</dt><dd>{health ? `${(health.jetson.memory_used_mb / 1024).toFixed(1)} / ${(health.jetson.memory_total_mb / 1024).toFixed(1)} GB` : "—"}</dd></div>
                  </dl>
                  <div className="storage-meter">
                    <div><span>Penyimpanan</span><strong>{health ? `${health.jetson.storage_percent}%` : "—"}</strong></div>
                    <div className="meter-track"><span style={{ width: `${health?.jetson.storage_percent ?? 0}%` }} /></div>
                  </div>
                </article>
              </section>

              <section className="panel camera-panel" aria-labelledby="camera-title">
                <div className="panel-heading">
                  <div><p className="panel-kicker">Frame terbaru</p><h2 id="camera-title">Tampilan kamera</h2></div>
                  <button className="refresh-button" type="button" onClick={refreshCameraFrame} aria-label="Perbarui frame kamera"><Icon name="refresh" className={frameLoading ? "spinning" : undefined} /></button>
                </div>
                <div className="camera-frame">
                  {/* The frame is proxied by FastAPI; the browser never receives RTSP credentials. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frameFailed ? "/Camera1.jpg" : getCameraFrameUrl(frameVersion)}
                    alt={frameFailed ? "Foto perangkat Kamera 1" : "Frame terbaru Kamera 1"}
                    loading="lazy"
                    onLoad={() => setFrameLoading(false)}
                    onError={() => { setFrameLoading(false); setFrameFailed(true); }}
                  />
                  {frameLoading && <div className="frame-state"><Icon name="refresh" className="spinning" /> Mengambil frame…</div>}
                  {frameFailed && <div className="frame-badge warning">Frame langsung belum tersedia</div>}
                  {!frameLoading && !frameFailed && <div className="frame-badge"><StatusDot /> Frame aktual</div>}
                </div>
                <dl className="camera-details">
                  <div><dt>Sumber</dt><dd>Camera 01</dd></div>
                  <div><dt>Alamat</dt><dd>10.21.20.52</dd></div>
                </dl>
                <div className="result-source"><Icon name="camera" /> Diperbarui otomatis setiap 30 detik · tanpa deteksi</div>
              </section>
            </aside>
          </div>
        </main>
      </div>

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        <span className="toast-icon"><Icon name="check" /></span>
        <div><strong>{toast || "Pembaruan selesai"}</strong><span>Data tersimpan dalam log aktivitas.</span></div>
      </div>
    </div>
  );
}
