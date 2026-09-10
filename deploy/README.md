# Jetson Docker trial

> For automatic GitHub Actions deployment after merging to `main`, see [CI-CD.md](CI-CD.md). This file remains the manual deployment and recovery guide.

This deployment keeps the detection environment and camera access on the Jetson host. FastAPI runs in Docker and connects back to the host through a dedicated SSH key. Caddy exposes one same-origin HTTP endpoint on the Jetson Tailnet address.

## 1. Clone or update the repository

```bash
cd /home/jetson
git clone https://github.com/Skirnola/SSH-BRIN-Web.git brin-edge-web
cd brin-edge-web
```

If it already exists:

```bash
cd /home/jetson/brin-edge-web
git pull --ff-only origin main
```

## 2. Create the container-only SSH identity

```bash
mkdir -p /home/jetson/.ssh
chmod 700 /home/jetson/.ssh

if [ ! -f /home/jetson/.ssh/brin_web_backend ]; then
  ssh-keygen -t ed25519 -f /home/jetson/.ssh/brin_web_backend -N '' -C 'brin-web-container'
fi

touch /home/jetson/.ssh/authorized_keys
grep -qxF "$(cat /home/jetson/.ssh/brin_web_backend.pub)" /home/jetson/.ssh/authorized_keys \
  || cat /home/jetson/.ssh/brin_web_backend.pub >> /home/jetson/.ssh/authorized_keys
chmod 600 /home/jetson/.ssh/authorized_keys
chmod 644 /home/jetson/.ssh/brin_web_backend.pub

# The API container runs as GID 10001. Give only that dedicated group
# read access to the private key without making it world-readable.
getent group 10001 >/dev/null || sudo groupadd --gid 10001 brin-container-secret
sudo chown jetson:10001 /home/jetson/.ssh/brin_web_backend
chmod 640 /home/jetson/.ssh/brin_web_backend
```

Pin the current Jetson SSH host key under the hostname used inside Docker:

```bash
ssh-keyscan -t ed25519,rsa 127.0.0.1 2>/dev/null \
  | sed 's/^127\.0\.0\.1/host.docker.internal/' \
  > /home/jetson/.ssh/brin_web_known_hosts
chmod 644 /home/jetson/.ssh/brin_web_known_hosts
```

Test the identity directly on the host:

```bash
ssh -i /home/jetson/.ssh/brin_web_backend \
  -o HostKeyAlias=host.docker.internal \
  -o UserKnownHostsFile=/home/jetson/.ssh/brin_web_known_hosts \
  jetson@127.0.0.1 hostname
```

Expected output:

```text
tegra-ubuntu
```

## 3. Create the private deployment environment

```bash
cd /home/jetson/brin-edge-web
cp deploy/jetson.env.example deploy/jetson.env
chmod 600 deploy/jetson.env
nano deploy/jetson.env
```

Get the Tailnet IP with:

```bash
tailscale ip -4
```

Use it for both:

```env
BIND_ADDRESS=<TAILSCALE_IP>
PUBLIC_ORIGIN=http://<TAILSCALE_IP>:3000
```

Copy the Firebase values from the existing private backend `.env`. Never commit `deploy/jetson.env`.

For this first HTTP-over-Tailnet test, keep:

```env
AUTH_COOKIE_SECURE=false
```

## 4. Verify Docker can SSH back to the host

```bash
docker run --rm \
  --add-host host.docker.internal:host-gateway \
  -v /home/jetson/.ssh/brin_web_backend:/root/.ssh/id_ed25519:ro \
  -v /home/jetson/.ssh/brin_web_known_hosts:/root/.ssh/known_hosts:ro \
  alpine:3.21 sh -c \
  "apk add --no-cache openssh-client >/dev/null && ssh -o BatchMode=yes jetson@host.docker.internal hostname"
```

If the request times out and UFW is active, allow SSH only from the Docker bridge:

```bash
sudo ufw allow in on docker0 to any port 22 proto tcp
```

Then repeat the test.

## 5. Validate and build

```bash
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env config --quiet
docker compose --env-file deploy/jetson.env build api
docker compose --env-file deploy/jetson.env build web
```

The initial ARM64 build can take several minutes. Do not run detection during the first build.

## 6. Start the workspace

```bash
docker compose --env-file deploy/jetson.env up -d
```

Confirm that the non-root API user can read the mounted key:

```bash
docker compose --env-file deploy/jetson.env exec api sh -c \
  'id && test -r /run/secrets/jetson_key && echo KEY_READABLE'
```

Check it:

```bash
docker compose --env-file deploy/jetson.env ps
docker compose --env-file deploy/jetson.env logs --tail=100
curl "http://$(tailscale ip -4):3000/api/v1/health"
docker stats --no-stream
```

Expected health response:

```json
{"status":"ok"}
```

Open from another Tailnet device:

```text
http://<JETSON_TAILSCALE_IP>:3000
```

Test in this order:

1. Firebase login.
2. Workspace file tree.
3. Device condition and camera frame.
4. Fullscreen Real-Time Cam.
5. One approved detection script, only when its Firebase side effects are acceptable.

## Operations

View logs:

```bash
docker compose --env-file deploy/jetson.env logs -f --tail=100
```

Restart:

```bash
docker compose --env-file deploy/jetson.env restart
```

Stop without deleting data:

```bash
docker compose --env-file deploy/jetson.env down
```

Update:

```bash
git pull --ff-only origin main
docker compose --env-file deploy/jetson.env up -d --build
docker image prune -f
```

The Compose configuration limits memory, process count, CPU, and log size. It exposes only Caddy; the Next.js and FastAPI ports are not published directly.

## HTTPS after the trial

Do not set `AUTH_COOKIE_SECURE=true` until the site is genuinely served through HTTPS. The next step can use Tailscale Serve or a BRIN DNS name with a valid certificate. At that point update `PUBLIC_ORIGIN`, enable secure cookies, and restart the stack.
