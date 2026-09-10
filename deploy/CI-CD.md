# BRIN CI/CD setup

This pipeline uses GitHub-hosted runners for tests and ARM64 image builds. The Jetson self-hosted runner performs deployment only after images have passed the quality and security jobs.

## Pipeline flow

```text
feature/* -> development -> pull request -> main
                                         -> tests
                                         -> ARM64 image build
                                         -> Trivy scan
                                         -> GitHub Container Registry
                                         -> Jetson pull + health check
                                         -> automatic rollback on failure
```

## 1. Repository settings

In GitHub, open **Settings → Actions → General**:

1. Allow GitHub Actions for the repository.
2. Set **Workflow permissions** to **Read and write permissions** so the pipeline can publish GHCR images.
3. Keep approval required for workflows from untrusted forks.

Create an environment under **Settings → Environments**:

```text
jetson-production
```

A required reviewer is recommended. Omit it only if every merge to `main` should deploy immediately without approval.

## 2. Development branch

The repository contains a `development` branch based on `main`. Use this flow:

```bash
git switch development
git pull --ff-only origin development
git switch -c feature/my-change
```

Push the feature branch and open a Pull Request into `development`. When a release is ready, open a Pull Request from `development` into `main`.

Recommended branch protection:

### `development`

- Require a pull request before merging.
- Require the three CI checks.
- Require branches to be up to date before merging.

### `main`

- Block direct pushes.
- Require a pull request before merging.
- Require the three CI checks.
- Require branches to be up to date before merging.
- Do not allow force pushes or deletion.

The expected checks are:

```text
Web quality
API quality and security
Validate Compose deployment
```

## 3. Install the self-hosted runner on Jetson

> The runner can execute deployment commands and access Docker. Only trusted maintainers may merge workflow changes into `main`.

Open **GitHub repository → Settings → Actions → Runners → New self-hosted runner**.

Choose:

```text
Linux
ARM64
```

On the Jetson, create a dedicated runner directory:

```bash
mkdir -p /home/jetson/actions-runner
cd /home/jetson/actions-runner
```

Copy the download and extraction commands displayed by GitHub. Do not reuse commands from another repository because the registration token is temporary and repository-specific.

Run the GitHub-provided configuration command and use:

```text
Runner name: brin-jetson
Additional label: brin-jetson
Work folder: _work
```

Do not run the runner interactively for long-term operation. Install it as a systemd service using the generated helper:

```bash
cd /home/jetson/actions-runner
sudo ./svc.sh install jetson
sudo ./svc.sh start
sudo ./svc.sh status
```

GitHub should show the runner as **Idle** with labels similar to:

```text
self-hosted, Linux, ARM64, brin-jetson
```

## 4. Verify the stable deployment checkout

The deployment job uses the existing checkout and private environment:

```text
/home/jetson/brin-edge-web
/home/jetson/brin-edge-web/deploy/jetson.env
```

Check:

```bash
cd /home/jetson/brin-edge-web
git status
test -f deploy/jetson.env && echo ENV_OK
docker compose --env-file deploy/jetson.env config --quiet
```

Tracked files must not contain local edits. The private `deploy/jetson.env` is ignored and remains untouched by deployment.

## 5. Enable automatic deployment

Do this only after the runner is online and the existing website is healthy.

In GitHub, open **Settings → Secrets and variables → Actions → Variables** and create:

```text
Name:  ENABLE_JETSON_DEPLOY
Value: true
```

This repository variable is the safety switch. Without it, pushes to `main` still test and publish images but do not deploy to the Jetson.

No Firebase password, SSH key, or `jetson.env` content belongs in GitHub Actions secrets. They remain on the Jetson.

## 6. First controlled deployment

Open **Actions → BRIN CI/CD → Run workflow**.

Choose:

```text
Branch: main
Deploy this main-branch commit to the Jetson: enabled
```

The workflow should run:

1. Web quality.
2. API quality and security.
3. Compose validation.
4. API and web ARM64 image publishing.
5. Trivy image scans.
6. Jetson deployment.
7. Local API and web health checks.

Monitor the Jetson:

```bash
cd /home/jetson/brin-edge-web
docker compose --env-file deploy/jetson.env ps
docker stats --no-stream
```

Tailscale Serve/Funnel remains active; it does not need to be restarted for normal deployments.

## 7. Normal release workflow

```text
1. Create feature branch from development.
2. Push feature branch.
3. PR feature -> development.
4. CI must pass.
5. Test the integrated development branch.
6. PR development -> main.
7. CI builds and scans immutable ARM64 images.
8. Jetson pulls the commit-SHA images automatically.
9. Health check passes or rollback runs.
```

Each production image uses the Git commit SHA:

```text
ghcr.io/skirnola/ssh-brin-web-api:<commit-sha>
ghcr.io/skirnola/ssh-brin-web-web:<commit-sha>
```

The mutable `main` tags are convenience tags only; production deployment uses the immutable SHA.

## 8. Verify a deployment

GitHub Actions records the deployed commit. On Jetson:

```bash
cat /home/jetson/brin-edge-web/.last-successful-deploy

docker inspect brin-edge-workspace-api-1 \
  --format '{{.Config.Image}}'

docker inspect brin-edge-workspace-web-1 \
  --format '{{.Config.Image}}'

curl -fsS http://127.0.0.1:3000/api/v1/health
```

## 9. Failure behavior

- Test failure: no image publication and no deployment.
- Image scan failure: no deployment.
- Jetson offline: deployment waits for a matching runner; the existing site continues running.
- Image pull failure: existing containers remain running.
- New deployment unhealthy: the script retags and restores the previous API and web image.
- Rollback unhealthy: workflow fails and prints service status/logs for manual response.

## 10. Pause automatic deployment

Change or delete this repository variable:

```text
ENABLE_JETSON_DEPLOY
```

Set it to:

```text
false
```

CI and image publication continue, but the Jetson deployment job is skipped.

## 11. Manual fallback

The original manual build remains available:

```bash
cd /home/jetson/brin-edge-web
git pull --ff-only origin main
docker compose --env-file deploy/jetson.env up -d --build
```

After CI/CD has deployed GHCR images, prefer rerunning the GitHub deployment workflow instead of mixing manual and automatic releases.
