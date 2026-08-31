---
title: "BRIN Edge Workspace — Runbook Operasional Jetson"
aliases:
  - Runbook Website BRIN
  - Cara Menyalakan dan Mematikan Website BRIN
tags:
  - brin
  - runbook
  - operations
  - docker
  - jetson
  - tailscale
status: maintained
---

# BRIN Edge Workspace — Runbook Operasional Jetson

> [!abstract] Tujuan
> Catatan ini adalah panduan operasional: menyalakan, mematikan, memeriksa, memperbarui, dan memulihkan website pada Jetson.

Penjelasan arsitektur tersedia di [[01-BRIN-Edge-Workspace-Arsitektur-dan-Workflow]].

---

## 1. Informasi dasar

| Item | Nilai |
|---|---|
| User host | `jetson` |
| Hostname | `tegra-ubuntu` atau hostname Tailscale terbaru |
| Folder aplikasi | `/home/jetson/brin-edge-web` |
| File konfigurasi privat | `deploy/jetson.env` |
| Workspace deteksi | `/home/jetson/BRIN RI NDIP` |
| Orchestrator | Docker Compose |
| Service | `api`, `web`, `caddy` |
| Akses private | Tailscale Serve |
| Akses public sementara | Tailscale Funnel |

> [!warning]
> Jangan menampilkan isi `deploy/jetson.env`, private key, atau password di chat, screenshot, GitHub, dan log publik.

Semua command Compose sebaiknya dijalankan dari folder project dengan `--env-file`:

```bash
cd /home/jetson/brin-edge-web
```

---

## 2. Pemeriksaan cepat

Gunakan ini sebagai pemeriksaan pertama:

```bash
cd /home/jetson/brin-edge-web

docker compose --env-file deploy/jetson.env ps
curl -fsS http://127.0.0.1:3000/api/v1/health
docker stats --no-stream
df -h /
free -h
tailscale funnel status
tailscale serve status
```

Response API yang sehat:

```json
{"status":"ok"}
```

### Arti status container

| Status | Makna |
|---|---|
| `Up ... (healthy)` | Service aktif dan health check berhasil |
| `Up ... (health: starting)` | Baru hidup; tunggu 15–30 detik |
| `Up ... (unhealthy)` | Process hidup tetapi health check gagal |
| `Exited` | Process berhenti; lihat logs |
| Tidak ada container | Stack belum dibuat atau sudah `down` |

---

## 3. Menyalakan website

### Kondisi A — container sudah pernah dibuat

```bash
cd /home/jetson/brin-edge-web

docker compose \
  --env-file deploy/jetson.env \
  up -d
```

Tunggu:

```bash
sleep 20
```

Periksa:

```bash
docker compose --env-file deploy/jetson.env ps
curl -fsS http://127.0.0.1:3000/api/v1/health
```

### Aktifkan akses public melalui Funnel

```bash
sudo tailscale funnel --bg http://127.0.0.1:3000
tailscale funnel status
```

Gunakan URL HTTPS yang ditampilkan oleh Tailscale.

### Atau aktifkan akses private melalui Serve

```bash
sudo tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

> [!important]
> Gunakan Funnel hanya jika pengguna tanpa Tailscale memang harus mengakses. Serve lebih aman karena hanya anggota Tailnet yang dapat membuka website.

### Verifikasi dari browser

1. Buka URL HTTPS.
2. Pastikan sertifikat tidak menampilkan warning.
3. Login.
4. Pastikan sidebar menampilkan file Jetson asli, bukan “Mode contoh”.
5. Pastikan metrik dan frame kamera muncul.

---

## 4. Mematikan website

Ada dua tingkat penghentian.

### Pilihan 1 — stop sementara

```bash
cd /home/jetson/brin-edge-web

docker compose \
  --env-file deploy/jetson.env \
  stop
```

Container tetap tercatat dan dapat dinyalakan cepat dengan `up -d`.

### Pilihan 2 — turunkan stack

```bash
docker compose \
  --env-file deploy/jetson.env \
  down
```

Ini menghapus container dan jaringan Compose, tetapi tidak menghapus image atau named volume.

### Matikan endpoint public

Jika Funnel aktif, hentikan juga akses internet:

```bash
sudo tailscale funnel reset
```

Jika sebelumnya memakai Serve dan ingin menghapus endpoint private:

```bash
sudo tailscale serve reset
```

Periksa:

```bash
tailscale funnel status
tailscale serve status
```

> [!danger]
> Jangan memakai `docker compose down -v` kecuali benar-benar ingin menghapus volume cache dan data Caddy.

---

## 5. Restart website

Restart semua service:

```bash
docker compose \
  --env-file deploy/jetson.env \
  restart
```

Restart hanya API:

```bash
docker compose \
  --env-file deploy/jetson.env \
  restart api
```

Restart hanya frontend:

```bash
docker compose \
  --env-file deploy/jetson.env \
  restart web
```

> [!note]
> `restart` tidak membaca ulang perubahan environment variable. Setelah mengubah `deploy/jetson.env`, gunakan `up -d --force-recreate`.

```bash
docker compose \
  --env-file deploy/jetson.env \
  up -d --force-recreate
```

---

## 6. Apakah website otomatis hidup setelah reboot?

Ya, selama:

- Docker service enabled.
- Container sebelumnya tidak dihentikan manual.
- Compose memakai `restart: unless-stopped`.

Periksa:

```bash
systemctl is-enabled docker
systemctl is-active docker
```

Expected:

```text
enabled
active
```

Setelah reboot:

```bash
docker compose --env-file deploy/jetson.env ps
tailscale funnel status
tailscale serve status
```

Tailscale biasanya menyimpan konfigurasi Serve/Funnel. Tetap verifikasi karena website public tidak boleh diasumsikan aktif tanpa pemeriksaan.

---

## 7. Melihat logs

### Semua service

```bash
docker compose \
  --env-file deploy/jetson.env \
  logs --tail=100
```

### Follow secara langsung

```bash
docker compose \
  --env-file deploy/jetson.env \
  logs -f --tail=100
```

Tekan `Ctrl+C` untuk berhenti melihat. Container tetap berjalan.

### Service tertentu

```bash
docker compose --env-file deploy/jetson.env logs --tail=100 api
docker compose --env-file deploy/jetson.env logs --tail=100 web
docker compose --env-file deploy/jetson.env logs --tail=100 caddy
```

Gunakan pembagian berikut:

- `caddy`: request masuk, routing, status proxy.
- `web`: startup Next.js dan error rendering.
- `api`: autentikasi, status endpoint, SSH, kamera, deteksi.

---

## 8. Update aplikasi dari GitHub

Sebelum update:

```bash
cd /home/jetson/brin-edge-web
git status
```

Working tree sebaiknya bersih. `deploy/jetson.env` tidak akan muncul karena di-ignore.

Ambil commit terbaru:

```bash
git pull --ff-only origin main
```

Build dan deploy:

```bash
docker compose \
  --env-file deploy/jetson.env \
  up -d --build
```

Periksa:

```bash
docker compose --env-file deploy/jetson.env ps
docker compose --env-file deploy/jetson.env logs --tail=100
curl -fsS http://127.0.0.1:3000/api/v1/health
```

Hapus image lama yang tidak dipakai:

```bash
docker image prune -f
```

> [!warning]
> Jangan menggunakan `docker system prune -a` tanpa memahami dampaknya. Command tersebut dapat menghapus image yang dibutuhkan untuk rollback.

---

## 9. Perubahan konfigurasi

Edit:

```bash
nano /home/jetson/brin-edge-web/deploy/jetson.env
```

Simpan Nano:

```text
Ctrl+O
Enter
Ctrl+X
```

Pastikan permission tetap privat:

```bash
chmod 600 deploy/jetson.env
```

Validasi tanpa mencetak secret:

```bash
docker compose \
  --env-file deploy/jetson.env \
  config --quiet
```

Terapkan:

```bash
docker compose \
  --env-file deploy/jetson.env \
  up -d --force-recreate
```

> [!danger]
> Jangan mengirim output lengkap `docker compose config` kepada orang lain karena environment hasil interpolasi dapat memuat informasi sensitif. Gunakan `config --quiet`.

---

## 10. Mengetahui website memakai data asli atau data contoh

Tanda koneksi berhasil:

- Sidebar menampilkan root workspace Jetson.
- Status berbunyi “Jetson terhubung”.
- Metrik GPU, suhu, dan memory memiliki nilai.
- Kamera memiliki IP dan latency.

Tanda fallback:

- Sidebar menampilkan “Mode contoh”.
- Status berbunyi “Jetson tidak terhubung”.
- Metrik berisi tanda `—`.

Jika fallback muncul, login dan frontend kemungkinan sehat, tetapi SSH dari API ke Jetson gagal.

---

## 11. Diagnosis SSH container ke Jetson

### Periksa secret mount

```bash
docker compose --env-file deploy/jetson.env exec api sh -c '
id
getent hosts host.docker.internal
ls -l /run/secrets
test -r /run/secrets/jetson_key && echo KEY_READABLE || echo KEY_NOT_READABLE
test -r /run/secrets/jetson_known_hosts && echo KNOWN_HOSTS_READABLE || echo KNOWN_HOSTS_NOT_READABLE
'
```

API berjalan sebagai UID/GID `10001`. Private key host harus dimiliki user Jetson dan dedicated group tersebut:

```bash
getent group 10001 >/dev/null \
  || sudo groupadd --gid 10001 brin-container-secret

sudo chown jetson:10001 /home/jetson/.ssh/brin_web_backend
sudo chmod 640 /home/jetson/.ssh/brin_web_backend
```

Jangan gunakan `chmod 644` atau `chmod 777` pada private key.

### Jalankan pemeriksaan aplikasi

```bash
docker compose --env-file deploy/jetson.env exec -T api python - <<'PY'
import asyncio
from app.config import get_settings
from app.jetson import check_connection

async def main():
    try:
        print("SSH_OK:", await check_connection(get_settings()))
    except Exception as error:
        print("SSH_ERROR_TYPE:", type(error).__name__)
        print("SSH_ERROR:", str(error))

asyncio.run(main())
PY
```

Expected:

```text
SSH_OK: ('tegra-ubuntu', '/home/jetson/BRIN RI NDIP')
```

### Arti error umum

| Error | Kemungkinan penyebab |
|---|---|
| `Permission denied: /run/secrets/jetson_key` | GID/mode private key salah |
| `Permission denied (publickey)` | Public key belum ada di `authorized_keys` |
| `Host key is not trusted` | `known_hosts` tidak cocok |
| `Connection refused` | SSH daemon tidak aktif atau port salah |
| Timeout | Firewall Docker bridge atau network host |
| Workspace tidak ditemukan | `JETSON_WORKSPACE` salah |

---

## 12. Troubleshooting berdasarkan gejala

### Website tidak dapat dibuka

```bash
tailscale funnel status
tailscale serve status
docker compose --env-file deploy/jetson.env ps
curl -v http://127.0.0.1:3000/api/v1/health
```

Jika local curl berhasil tetapi URL gagal, fokus pada Tailscale/DNS. Jika local curl gagal, fokus pada Caddy/API.

### Muncul `502 Bad Gateway`

```bash
docker compose --env-file deploy/jetson.env ps
docker compose --env-file deploy/jetson.env logs --tail=100 caddy web api
```

Caddy hidup, tetapi service tujuan belum sehat atau berhenti.

### Login selalu salah

Periksa konfigurasi non-secret:

```bash
docker compose --env-file deploy/jetson.env exec api python -c '
import os
print(os.environ["AUTH_USERNAME"])
print(os.environ["FIREBASE_ADMIN_EMAIL"])
print(os.environ["FIREBASE_PROJECT_ID"])
'
```

Pastikan tidak ada nilai `replace-with-...` di `deploy/jetson.env`. Jangan menampilkan API key.

### Kamera snapshot gagal

```bash
docker compose --env-file deploy/jetson.env logs --tail=100 api
ping -c 2 10.21.20.52
```

Ping kamera dijalankan dari host Jetson. Pastikan interface jaringan kamera masih aktif.

### Real-Time Cam gagal

Kemungkinan:

- Kamera tidak tersedia.
- Empat viewer sudah aktif.
- RTSP channel bermasalah.
- SSH stream terputus.
- Jetson kekurangan resource.

```bash
docker stats --no-stream
docker compose --env-file deploy/jetson.env logs --tail=100 api
```

### Deteksi mendapat `409`

Satu process deteksi lain masih aktif. Tutup viewer deteksi sebelumnya dan tunggu process remote berhenti.

Periksa process dengan hati-hati:

```bash
pgrep -af '/home/jetson/yolo-env/bin/python'
```

Jangan membunuh process sebelum memastikan itu memang process deteksi web dan bukan workload riset lain.

---

## 13. Monitoring resource Jetson

### Sekali lihat

```bash
docker stats --no-stream
free -h
df -h /
uptime
```

### Process Jetson

```bash
tegrastats
```

Tekan `Ctrl+C` untuk berhenti.

Perhatikan:

- Memory available.
- Swap terus meningkat.
- Suhu.
- Storage di atas 80%.
- API/web restart berulang.
- Live stream terlalu banyak.

---

## 14. Backup yang harus dimiliki

File privat penting:

```text
/home/jetson/brin-edge-web/deploy/jetson.env
/home/jetson/.ssh/brin_web_backend
/home/jetson/.ssh/brin_web_backend.pub
/home/jetson/.ssh/brin_web_known_hosts
```

Backup harus:

- Dienkripsi.
- Disimpan di storage BRIN yang aman.
- Tidak dimasukkan ke GitHub.
- Tidak dikirim melalui chat biasa.

Source code tidak perlu backup manual karena berada di GitHub. Dataset, model, Firebase, dan workspace riset memiliki kebijakan backup terpisah.

---

## 15. Maintenance rutin

### Mingguan

```bash
docker compose --env-file deploy/jetson.env ps
docker stats --no-stream
df -h /
free -h
docker compose --env-file deploy/jetson.env logs --tail=100
```

### Bulanan

```bash
sudo apt update
docker image prune -f
git fetch origin
git status
```

Jangan melakukan upgrade OS, Docker, atau dependency tepat sebelum demonstrasi tanpa waktu untuk regression test.

---

## 16. Incident response sederhana

Jika ada indikasi akun bocor atau akses tidak sah:

1. Matikan akses public:

```bash
sudo tailscale funnel reset
```

2. Stop aplikasi jika perlu:

```bash
docker compose --env-file deploy/jetson.env stop
```

3. Reset password Firebase.
4. Periksa logs Caddy dan API.
5. Rotasi SSH key container jika dicurigai bocor.
6. Jangan menghapus logs sebelum disalin untuk investigasi.
7. Aktifkan kembali hanya setelah penyebab dipahami.

> [!important]
> URL yang sulit ditebak bukan kontrol keamanan. Ketika Funnel aktif, login page adalah service internet publik.

---

## 17. Cheat sheet

### ON — public

```bash
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env up -d
sleep 20
curl -fsS http://127.0.0.1:3000/api/v1/health
sudo tailscale funnel --bg http://127.0.0.1:3000
tailscale funnel status
```

### ON — private Tailnet

```bash
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env up -d
sleep 20
curl -fsS http://127.0.0.1:3000/api/v1/health
sudo tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

### OFF

```bash
sudo tailscale funnel reset
sudo tailscale serve reset
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env stop
```

### STATUS

```bash
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env ps
curl -fsS http://127.0.0.1:3000/api/v1/health
docker stats --no-stream
tailscale funnel status
tailscale serve status
```

### UPDATE

```bash
cd /home/jetson/brin-edge-web
git pull --ff-only origin main
docker compose --env-file deploy/jetson.env up -d --build
docker image prune -f
```

---

## Prinsip terakhir

> [!success]
> Operator yang baik tidak hanya tahu command untuk menyalakan service. Ia tahu cara memverifikasi service, membaca gejala, membatasi dampak, dan mengembalikan sistem ke kondisi aman.
