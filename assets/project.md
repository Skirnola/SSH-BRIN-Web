# BRIN Edge Workspace

Status: **Project definition / pre-development**  
Selected UI direction: **Research Desk**  
Primary platform: **Internal web application**  
Last updated: **30 August 2026**

Design specification: [`assets/concept/design.md`](./assets/concept/design.md)  
Interactive prototype: [`assets/concept/concept-desk.html`](./assets/concept/concept-desk.html)

## 1. Project summary

BRIN Edge Workspace adalah website internal untuk mengelola dan memantau komputer edge NVIDIA Jetson melalui alur kerja yang menyerupai SSH, tetapi tetap mudah dipahami oleh pegawai yang tidak terbiasa dengan terminal.

Website menggabungkan empat kebutuhan yang muncul selama pembahasan proyek:

1. Menjelajahi folder dan file pada workspace Jetson.
2. Membuka script atau konfigurasi yang digunakan oleh sistem kamera.
3. Menjalankan proses deteksi dari website dengan aman.
4. Melihat kondisi kamera, Jetson, dan hasil deteksi terakhir dalam satu layar.

Pengguna tidak diberikan terminal SSH tanpa batas. Tombol pada UI akan diterjemahkan backend menjadi operasi yang sudah disetujui, memiliki timeout, validasi, permission, dan audit log.

## 2. Background dari pembahasan proyek

Keputusan yang telah disepakati dari percakapan desain dan pekerjaan SSH Jetson:

- Website ditujukan untuk pegawai BRIN, bukan hanya developer atau administrator Linux.
- Identitas visual harus dekat dengan tema BRIN dan menggunakan logo resmi pada versi produksi.
- UI harus terasa seperti mengakses komputer remote: terdapat folder, file, script, koneksi, serta status perangkat.
- Visual terminal bergaya “hacker”, neon hijau, atau desain yang terlalu teknis harus dihindari.
- Pengguna nantinya dapat membuka file yang berisi kode dan menjalankan proses deteksi.
- Website harus menampilkan hasil deteksi kamera.
- Website harus dapat memeriksa apakah kamera aktif dan kondisinya normal.
- Website harus dapat membaca kondisi Jetson seperti GPU, memori, suhu, storage, uptime, dan konektivitas.
- Arah desain final adalah **Research Desk**: terang, tenang, sederhana, modern, serta mudah dipindai.
- Animasi harus halus dan fungsional, terutama ketika membuka folder, menjalankan proses, dan menerima hasil.

## 3. Problem statement

Pengoperasian Jetson melalui SSH efektif bagi engineer, tetapi memiliki beberapa hambatan untuk penggunaan organisasi:

- Pengguna harus mengingat alamat perangkat, kredensial, path, dan command.
- Command yang salah dapat menghentikan service atau merusak konfigurasi.
- Status kamera, Jetson, file, dan hasil deteksi tersebar di beberapa tool.
- Tidak semua pegawai memahami output Linux atau log computer vision.
- Sulit mengetahui siapa menjalankan proses tertentu jika tidak ada audit trail terpusat.

BRIN Edge Workspace menyederhanakan aktivitas yang berulang tanpa menghilangkan visibilitas teknis yang dibutuhkan tim IT.

## 4. Product goals

### Goal utama

- Mengurangi ketergantungan pada command line untuk operasi rutin.
- Menyediakan satu sumber informasi untuk health perangkat dan kamera.
- Membuat proses deteksi dapat dijalankan serta dipantau secara aman.
- Mempercepat troubleshooting awal sebelum engineer melakukan SSH langsung.
- Menyediakan audit log untuk setiap operasi yang dijalankan dari web.

### Indikator keberhasilan

- Pegawai dapat menemukan perangkat dan menjalankan deteksi tanpa menghafal command.
- Status kamera dan Jetson dapat dipahami dalam waktu kurang dari satu menit.
- Tidak ada input browser yang dieksekusi sebagai shell command mentah.
- Setiap job memiliki pengguna, perangkat, waktu, status, dan output yang tercatat.
- Gangguan kamera atau Jetson dapat dibedakan dari kegagalan website.

## 5. Users and roles

| Role | Kemampuan |
|---|---|
| Viewer | Melihat perangkat, file read-only, status, dan hasil deteksi |
| Operator | Menjalankan job yang tersedia dan melihat log job |
| Engineer | Mengelola konfigurasi yang diizinkan, restart service tertentu, dan melakukan troubleshooting |
| Administrator | Mengelola user, role, device registry, credential reference, dan command allowlist |
| Auditor | Membaca audit log tanpa menjalankan operasi |

Hak akses harus mengikuti prinsip least privilege. Pegawai biasa tidak otomatis memperoleh akses Engineer atau Administrator.

## 6. MVP scope

### Included

- Login melalui identity provider internal atau akun aplikasi sementara.
- Daftar lokasi dan Jetson yang terdaftar.
- Status online, last seen, dan ringkasan health Jetson.
- Status kamera, FPS, latensi, serta frame terakhir bila diizinkan.
- File explorer read-only untuk folder workspace yang sudah ditentukan.
- Pembacaan file teks yang diizinkan seperti `.py`, `.yaml`, `.json`, `.log`, dan `.md`.
- Menjalankan satu atau beberapa detection job yang sudah didaftarkan.
- Job state: queued, running, succeeded, failed, timed out, dan cancelled.
- Output log yang sudah disanitasi.
- Hasil deteksi terakhir dan metadata confidence.
- Audit log operasi pengguna.
- Responsive layout desktop, tablet, dan mobile.

### Not included in the first MVP

- Terminal shell bebas dari browser.
- Upload dan eksekusi script arbitrer.
- Editing semua file sistem Jetson.
- Root access dari website.
- Port forwarding umum.
- Remote desktop.
- Model training di website.
- Penyimpanan video tanpa batas.
- Automatic device provisioning untuk Jetson baru.

Fitur di luar scope hanya ditambahkan setelah threat model dan alur approval ditentukan.

## 7. Primary user flows

### A. Memeriksa perangkat

1. Pengguna memilih lokasi.
2. Pengguna memilih Jetson.
3. Website menampilkan online state, last seen, GPU, suhu, memori, storage, dan uptime.
4. Jika data sudah lama, UI menampilkan **Data tidak terbaru**, bukan **Normal**.
5. Pengguna dapat membuka detail diagnostic sesuai permission.

### B. Memeriksa kamera

1. Pengguna membuka folder atau perangkat kamera.
2. Website menampilkan stream state, FPS, latensi, dan last frame timestamp.
3. Thumbnail hanya dimuat bila pengguna memiliki izin.
4. Jika stream gagal, UI membedakan network error, authentication error, dan no-frame condition.

### C. Menjalankan deteksi

1. Pengguna membuka script detection yang terdaftar.
2. Pengguna memilih **Jalankan deteksi**.
3. Backend memvalidasi role, device, job definition, dan status perangkat.
4. Job masuk antrean dan mendapat `jobId`.
5. Frontend menerima progress melalui SSE atau WebSocket.
6. Backend menjalankan command template yang sudah di-allowlist pada Jetson.
7. Hasil, log, exit code, durasi, dan artifact dicatat.
8. UI menampilkan hasil atau pesan pemulihan yang spesifik.

### D. Membuka file

1. Backend hanya menampilkan root directory yang terdaftar.
2. Path dinormalisasi dan divalidasi untuk mencegah traversal.
3. Ukuran dan tipe file diperiksa sebelum dibaca.
4. File sensitif seperti private key, `.env`, password store, dan system shadow selalu diblokir.
5. Aktivitas membaca file sensitif yang diizinkan tetap masuk audit log.

## 8. Recommended architecture

```text
Employee Browser
       │ HTTPS
       ▼
Reverse Proxy / Internal Gateway
       │
       ├── Web Frontend
       │     └── Research Desk UI
       │
       └── API Backend
             ├── Authentication + RBAC
             ├── Device Registry
             ├── File Service
             ├── Job Service
             ├── Health Collector
             ├── Audit Service
             └── Artifact Service
                    │
                    ├── PostgreSQL
                    ├── Redis / Job Queue
                    └── Object Storage
                           │
                           ▼
                    Management Network
                           │ SSH / SFTP / Metrics
                           ▼
                    NVIDIA Jetson Devices
                           │
                           ├── Detection service
                           ├── Camera / RTSP / GStreamer
                           ├── tegrastats metrics
                           └── Workspace files
```

Browser tidak pernah berkomunikasi langsung dengan port SSH Jetson. Seluruh koneksi melewati backend pada management network.

## 9. Recommended tools

### 9.1 Current prototype

| Area | Tool saat ini | Keterangan |
|---|---|---|
| Markup | HTML | Prototype Research Desk |
| Styling | CSS | Tokens, responsive layout, dan animation |
| Interaction | Vanilla JavaScript | File tree, run state, confidence update, dan toast |
| Assets | SVG dan PNG | Logo prototype dan screenshot referensi |

Prototype digunakan sebagai visual reference. Prototype bukan backend dan seluruh data di dalamnya masih simulasi.

### 9.2 Production frontend

| Tool | Penggunaan | Alasan |
|---|---|---|
| Next.js App Router | Struktur aplikasi web | Routing, layout, rendering, dan organisasi project yang jelas |
| React + TypeScript | Component dan state | Type safety untuk device, job, health, dan permission data |
| CSS Modules atau Tailwind CSS | Styling | Implementasikan token dari `design.md`; pilih satu pendekatan dan konsisten |
| TanStack Query | Server state | Cache, refresh health data, retry, dan invalidation |
| SSE terlebih dahulu | Progress dan log | Cocok untuk aliran server-ke-browser yang dominan satu arah |
| WebSocket bila diperlukan | Interaksi real-time dua arah | Gunakan jika operator perlu pause, cancel, atau sesi interaktif kompleks |
| Shiki | Read-only code rendering | Syntax highlighting ringan dan aman untuk viewer |
| Monaco Editor, fase lanjut | Editing file | Hanya dipakai jika workflow editing benar-benar disetujui |
| Vitest + Testing Library | Unit/component test | Menguji state UI dan permission behavior |
| Playwright | End-to-end test | Menguji user flow pada browser nyata |

Next.js App Router mendukung file-based routing, TypeScript, Server Components, Suspense, dan struktur layout modern; rujuk [dokumentasi resmi Next.js](https://nextjs.org/docs/app).

Motion sederhana tetap memakai CSS transition. Tambahkan motion library hanya bila terdapat interaksi kompleks yang tidak dapat dijelaskan dengan CSS.

### 9.3 Production backend

| Tool | Penggunaan | Alasan |
|---|---|---|
| Python 3.12+ | Runtime backend | Selaras dengan computer vision dan tooling Jetson |
| FastAPI | REST API, SSE/WebSocket, validation | Type-friendly, OpenAPI, dan cocok dengan ekosistem Python |
| Pydantic | Request, response, dan settings schema | Validasi data serta konfigurasi |
| AsyncSSH | SSH dan SFTP ke Jetson | SSHv2 async, command execution, SFTP, serta host-key support |
| PostgreSQL | Data utama | User mapping, devices, jobs, results, dan audit logs |
| Redis | Queue state dan pub/sub | Progress job serta komunikasi worker |
| Celery, RQ, atau Dramatiq | Durable job worker | Detection job tidak hilang ketika API restart |
| MinIO atau object storage internal | Frame dan result artifact | Memisahkan binary artifact dari database |
| Alembic | Database migration | Versioning schema |
| Pytest | Unit dan integration test | Backend, permission, dan job behavior |
| Ruff + mypy | Lint dan type checking | Menjaga konsistensi serta bug prevention |

FastAPI `BackgroundTasks` cukup untuk pekerjaan kecil, tetapi dokumentasi resminya menyarankan job queue terpisah untuk komputasi berat atau multi-process. Detection job produksi sebaiknya dijalankan worker yang durable; lihat [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/).

AsyncSSH menyediakan SSHv2, command channels, SFTP, dan SCP berbasis asyncio; lihat [dokumentasi resmi AsyncSSH](https://asyncssh.readthedocs.io/en/stable/).

### 9.4 Jetson and camera tools

| Tool | Penggunaan |
|---|---|
| NVIDIA JetPack | Runtime dasar Jetson |
| `tegrastats` | GPU, CPU, RAM, suhu, dan resource metrics |
| Node Exporter | Metrics OS, filesystem, network, dan uptime |
| Prometheus | Scraping dan penyimpanan time-series metrics |
| Alertmanager | Alert state dan notification routing |
| OpenCV | Frame processing dan image utilities |
| GStreamer | Camera/RTSP pipeline |
| NVIDIA DeepStream | Video analytics multi-stream bila dibutuhkan |
| TensorRT | Optimasi inference model pada Jetson |
| Docker + NVIDIA Container Runtime | Isolasi detection service dan deployment konsisten |
| systemd | Menjaga collector atau service tetap berjalan |

NVIDIA mendokumentasikan monitoring Jetson melalui exporter, Prometheus, Node Exporter, camera/FPS metrics, dan `tegrastats`; lihat [Jetson Platform Services Monitoring](https://docs.nvidia.com/jetson/jps/platform-services/monitoring.html).

Tidak semua tools harus langsung dipakai. Untuk satu Jetson pada MVP, collector ringan yang membaca `tegrastats` dan health endpoint aplikasi sudah cukup. Prometheus dan Alertmanager menjadi penting ketika jumlah perangkat bertambah.

### 9.5 Infrastructure

| Tool | Penggunaan |
|---|---|
| Nginx atau internal reverse proxy | TLS termination, routing, rate limit |
| Docker Compose | Development dan deployment kecil |
| Kubernetes, opsional | Deployment multi-site atau high availability |
| Vault atau secret manager internal | SSH key, camera credential, dan application secrets |
| GitHub Actions/GitLab CI/internal CI | Test, lint, build, dan deployment gate |
| Sentry atau OpenTelemetry | Application error dan tracing |

Gunakan infrastruktur yang sudah disetujui BRIN. Jangan menambahkan cloud eksternal untuk frame kamera, credential, atau telemetry tanpa review kebijakan data.

## 10. Backend modules

```text
backend/
├── api/
│   ├── auth.py
│   ├── devices.py
│   ├── files.py
│   ├── jobs.py
│   ├── cameras.py
│   └── audit.py
├── domain/
│   ├── device.py
│   ├── job.py
│   ├── permission.py
│   └── result.py
├── services/
│   ├── ssh_service.py
│   ├── file_service.py
│   ├── health_service.py
│   ├── job_service.py
│   └── artifact_service.py
├── workers/
│   └── detection_worker.py
├── repositories/
├── security/
├── tests/
└── main.py
```

SSH implementation harus berada di satu service boundary. Endpoint tidak boleh membuat shell command menggunakan string concatenation dari input user.

## 11. Proposed repository structure

```text
WebsiteBRINSSH/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # FastAPI backend
├── services/
│   ├── worker/              # Detection job worker
│   └── jetson-agent/        # Optional local metrics/command agent
├── packages/
│   ├── ui/                  # Research Desk components and tokens
│   └── contracts/           # Shared API schema or generated client
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── monitoring/
├── assets/
│   ├── concept/             # Current HTML prototypes and design.md
│   └── references/          # Verified screenshots
├── docs/
│   ├── api.md
│   ├── security.md
│   ├── deployment.md
│   └── operations.md
├── project.md
└── README.md
```

Struktur ini adalah target produksi, bukan struktur yang harus dibuat sekaligus pada fase prototype.

## 12. Core API proposal

```text
GET    /api/v1/sites
GET    /api/v1/devices
GET    /api/v1/devices/{deviceId}
GET    /api/v1/devices/{deviceId}/health
GET    /api/v1/devices/{deviceId}/cameras
GET    /api/v1/cameras/{cameraId}/health
GET    /api/v1/cameras/{cameraId}/latest-frame

GET    /api/v1/workspaces/{workspaceId}/files?path=...
GET    /api/v1/workspaces/{workspaceId}/file?path=...

GET    /api/v1/job-definitions
POST   /api/v1/jobs
GET    /api/v1/jobs/{jobId}
POST   /api/v1/jobs/{jobId}/cancel
GET    /api/v1/jobs/{jobId}/events
GET    /api/v1/jobs/{jobId}/artifacts

GET    /api/v1/audit-events
```

Contoh membuat job:

```json
{
  "jobDefinitionId": "vehicle-detection-v4",
  "deviceId": "JETSON-ORIN-07",
  "cameraId": "CAM-GU-01",
  "parameters": {
    "confidenceThreshold": 0.85
  }
}
```

Parameter yang diterima harus didefinisikan pada schema job. Backend tidak menerima field seperti `command`, `shell`, atau raw script dari operator biasa.

## 13. Job definition model

Setiap operasi yang dapat dijalankan dari UI disimpan sebagai job definition terkontrol:

```yaml
id: vehicle-detection-v4
displayName: Deteksi kendaraan
allowedRoles:
  - operator
  - engineer
timeoutSeconds: 120
workingDirectory: /opt/brin/edge-vision/kamera-gerbang
executable: /opt/brin/venv/bin/python
arguments:
  - deteksi_kendaraan.py
allowedParameters:
  confidenceThreshold:
    type: number
    minimum: 0.50
    maximum: 0.99
artifacts:
  - results/latest.json
  - results/latest.jpg
```

Nilai akhir tetap dibentuk backend dari template, bukan dari string bebas milik pengguna.

## 14. Suggested data model

| Entity | Data penting |
|---|---|
| User | identity provider ID, name, role, active state |
| Site | name, code, timezone, network zone |
| Device | name, type, address reference, site, enabled state |
| Camera | device relation, stream reference, name, enabled state |
| Workspace | device, allowed root, read/write policy |
| JobDefinition | command template, roles, timeout, parameter schema |
| JobRun | user, device, definition, state, timestamps, exit code |
| DetectionResult | job, camera, class, confidence, bounding boxes |
| Artifact | job, type, storage key, checksum, retention expiry |
| HealthSample | device, metric values, collected timestamp |
| AuditEvent | actor, action, target, timestamp, result, correlation ID |

## 15. Health states

| UI state | Arti |
|---|---|
| Healthy | Semua pemeriksaan penting normal dan data masih fresh |
| Warning | Perangkat hidup, tetapi metric mendekati threshold atau data terlambat |
| Critical | Service utama gagal, suhu melewati batas, atau kamera tidak menghasilkan frame |
| Offline | Jetson tidak dapat dihubungi dalam periode yang ditentukan |
| Unknown | Belum ada data atau collector bermasalah |

Threshold suhu, GPU, storage, dan FPS harus dapat dikonfigurasi per model Jetson serta jenis kamera. Jangan memakai satu nilai hardcoded untuk semua perangkat.

## 16. Security requirements

### Authentication and authorization

- Integrasikan SSO/OIDC internal bila tersedia.
- Terapkan RBAC pada API, bukan hanya menyembunyikan tombol di frontend.
- Gunakan session expiration dan re-authentication untuk tindakan berisiko.

### SSH

- Simpan SSH private key di secret manager, bukan database atau browser.
- Verifikasi host key Jetson dan blokir koneksi jika fingerprint berubah tanpa approval.
- Gunakan user Linux khusus dengan permission minimum.
- Nonaktifkan password login jika kebijakan infrastruktur memungkinkan.
- Batasi koneksi ke management network.
- Jangan menggunakan `sudo` umum; jika diperlukan, allowlist subcommand tertentu melalui kebijakan sistem.

### File access

- Setiap workspace memiliki allowed root directory.
- Normalisasi path dan tolak `..`, symlink escape, device file, dan path absolut yang tidak terdaftar.
- Blokir secret files, private keys, tokens, dan credential stores.
- Batasi ukuran file serta format yang dapat ditampilkan.

### Command execution

- Jalankan job definition, bukan shell input.
- Hindari `shell=True`.
- Gunakan argument array dan fixed executable.
- Terapkan timeout, cancellation, concurrency limit, dan output size limit.
- Sanitasi log sebelum dikirim ke browser.
- Catat correlation ID dari request sampai command selesai.

### Camera and privacy

- Batasi siapa yang dapat melihat live frame atau snapshot.
- Tentukan retention period untuk gambar dan video.
- Jangan mengirim frame kamera ke layanan eksternal tanpa persetujuan.
- Audit akses ke frame apabila data dapat mengidentifikasi orang atau kendaraan.

## 17. Observability

- Structured JSON logs pada frontend server, API, worker, dan collector.
- Correlation ID untuk setiap user action dan job.
- Metrics: request latency, SSH latency, job queue length, job duration, job failure rate, device online count, camera FPS, dan stale health count.
- Alerts untuk repeated SSH failure, host-key mismatch, overheating, storage pressure, camera no-frame, dan queue backlog.
- Dashboard engineer dapat memakai Grafana; dashboard pegawai tetap menggunakan Research Desk agar tidak terlalu teknis.

## 18. Testing strategy

### Frontend

- Component state: loading, empty, permission denied, offline, stale, success, dan error.
- Keyboard navigation pada file tree dan drawer.
- Responsive test pada desktop, tablet, dan mobile.
- Reduced motion dan contrast check.

### Backend

- Unit test untuk path validation, command builder, role check, dan status mapping.
- Integration test dengan SSH server test container, bukan Jetson produksi.
- Contract test untuk API schema.
- Worker test untuk timeout, cancel, duplicate request, dan retry.
- Security test untuk path traversal, command injection, IDOR, CSRF, dan rate limit.

### Jetson

- Test pada model Jetson dan versi JetPack yang benar-benar digunakan.
- Simulasikan camera disconnect, high temperature, disk full, SSH unavailable, dan detection crash.
- Validasi bahwa collector tidak mengganggu performa inference.

## 19. Development phases

### Phase 0 — Discovery

- Inventaris Jetson, versi JetPack, IP/network zone, camera protocol, dan script yang sudah digunakan.
- Dokumentasikan command SSH yang saat ini dijalankan manual.
- Tentukan role dan approval owner.
- Tentukan klasifikasi data kamera.

### Phase 1 — Read-only monitoring

- Login dan RBAC dasar.
- Device registry.
- Health Jetson dan kamera.
- File explorer read-only.
- Research Desk UI dengan data nyata.

### Phase 2 — Controlled detection jobs

- Job definitions.
- Durable queue dan worker.
- Live progress.
- Detection results dan artifact storage.
- Audit log lengkap.

### Phase 3 — Operations hardening

- Alerting dan monitoring.
- SSO integration.
- Secret rotation.
- Backup, restore, retention, dan disaster recovery.
- Load and failure testing.

### Phase 4 — Optional controlled editing

- File versioning dan diff.
- Approval sebelum deploy konfigurasi.
- Rollback.
- Monaco editor hanya jika kebutuhan operasional sudah dibuktikan.

## 20. MVP acceptance criteria

- Pengguna dengan role Viewer tidak dapat menjalankan job.
- Operator hanya dapat menjalankan job yang terdaftar untuk perangkat yang diizinkan.
- Website tidak mengekspos SSH credential atau command bebas.
- Health card menyertakan waktu pengambilan data.
- Offline, stale, warning, dan critical state memiliki tampilan yang berbeda.
- Detection job tetap dapat dilacak setelah halaman browser di-refresh.
- Timeout atau error menghasilkan pesan yang dapat ditindaklanjuti.
- Setiap job memiliki audit event.
- File explorer tidak dapat keluar dari workspace root.
- UI mengikuti `design.md` dan lolos responsive serta accessibility checks.

## 21. Assumptions to confirm

Hal berikut belum dipastikan dari percakapan dan perlu dikonfirmasi sebelum implementasi backend:

1. Model Jetson yang digunakan: Nano, Xavier, Orin Nano, Orin NX, atau AGX Orin.
2. Versi JetPack dan Ubuntu/L4T.
3. Jumlah Jetson, lokasi, dan pola network access.
4. Apakah backend berada pada jaringan yang dapat menjangkau semua Jetson.
5. Camera protocol: RTSP, USB/V4L2, CSI, HTTP, atau vendor SDK.
6. Framework deteksi saat ini: OpenCV, YOLO, DeepStream, TensorRT, atau script custom.
7. Command, working directory, Python environment, dan output format yang saat ini digunakan melalui SSH.
8. Apakah website hanya membaca file atau nantinya perlu editing dan upload.
9. Sistem login internal yang tersedia.
10. Retention dan privacy policy untuk frame kamera serta hasil deteksi.
11. Apakah sistem harus berjalan tanpa internet pada jaringan internal.
12. Target browser dan perangkat yang digunakan pegawai.

## 22. Immediate next steps

1. Kumpulkan satu contoh sesi SSH Jetson yang berhasil, termasuk command dan output yang aman untuk dibagikan.
2. Catat path project, nama virtual environment/container, serta cara menjalankan detection script.
3. Catat output `tegrastats` dan status kamera dari Jetson target.
4. Tentukan satu Jetson development sebagai perangkat uji.
5. Buat backend proof-of-concept read-only untuk health dan file listing.
6. Hubungkan prototype Research Desk ke mock API sebelum koneksi ke perangkat nyata.
7. Lakukan security review sebelum mengaktifkan job execution.

## 23. Reference documents

- [`assets/concept/design.md`](./assets/concept/design.md) — keputusan visual dan UX Research Desk.
- [`assets/references/`](./assets/references/) — screenshot desktop, detection result, dan mobile navigation.
- [Next.js App Router documentation](https://nextjs.org/docs/app).
- [FastAPI Background Tasks documentation](https://fastapi.tiangolo.com/tutorial/background-tasks/).
- [AsyncSSH documentation](https://asyncssh.readthedocs.io/en/stable/).
- [NVIDIA Jetson Platform Services Monitoring](https://docs.nvidia.com/jetson/jps/platform-services/monitoring.html).

