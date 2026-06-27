# Shortcut AI: Deployment Architecture Playbook

## 1. Container Topology
To achieve scale and prevent the Next.js API from being suffocated by heavy OS binaries, the platform is decoupled into two multi-stage Docker images:

- **App Container (`docker/app.Dockerfile`)**: A lightweight Node.js 20 Alpine image that serves the Next.js standalone API and Dashboard. It has an incredibly small footprint.
- **Worker Container (`docker/worker.Dockerfile`)**: A Debian-based Node.js 20 Slim image that natively installs `ffmpeg`, `python3`, and `yt-dlp` via `apt-get`. This image executes the BullMQ consumer loops (`npm run start:worker`).

## 2. CI/CD & Database Migrations
The CI/CD pipeline (`main.yml`) automatically builds these images upon merging to `main`.
Before swapping traffic to the new containers, the CI/CD pipeline triggers:
```bash
npx prisma migrate deploy
```
This ensures the PostgreSQL schema matches the Prisma Client generated inside the Docker containers.

## 3. Scaling Workers
Because the architecture relies on BullMQ and Redis for event-driven orchestration, the Worker containers are **completely stateless**. You can horizontally scale the workers mathematically.

To double rendering throughput in Docker Compose:
```bash
docker-compose up -d --scale worker=4
```

## 4. Rollback Procedures
If a severe crash occurs in production, you must immediately revert to the previous known-good Docker image.

### Standard GitOps Rollback
1. Revert the commit in GitHub: `git revert <bad-commit-hash>`
2. Merge the revert PR. CI/CD will automatically build and deploy the safe state.

### Emergency Image Tag Rollback
If the CI/CD pipeline is down, SSH into your deployment server and manually pull the previous tag:
```bash
docker pull shortcut-app:v1.0.4
docker pull shortcut-worker:v1.0.4

# Update docker-compose.yml or Swarm manifests to point to v1.0.4
docker-compose up -d
```

> **Warning regarding Database Rollbacks**: If the bad deployment included a database migration (e.g., dropping a column), rolling back the Docker image will **NOT** revert the database schema. In extreme cases, you must restore the RDS/PostgreSQL snapshot taken prior to the `migrate deploy` step.
