# 🚀 ShortCut AI - Production Launchpad

ShortCut AI is a high-performance, production-grade SaaS application designed for automated video analysis, transcription, clipping, rendering, and distribution. Engineered with a robust, decoupled microservices architecture, it handles high-throughput video processing jobs reliably using background queues.

---

## 🛠️ Tech Stack & Architecture

- **Frontend/Backend**: [Next.js 16 (App Router)](https://nextjs.org/) + React 19 (compiled with Turbopack)
- **Database ORM**: [Prisma v6](https://prisma.io) with PostgreSQL
- **Task Queue & Workers**: [BullMQ](https://bullmq.io/) backed by [Redis](https://redis.io/)
- **Authentication**: [Clerk](https://clerk.dev) (Session tokens & Serverless middleware)
- **Billing & Subscriptions**: [Stripe](https://stripe.com) (Sub-second webhook handling & subscription management)
- **Object Storage**: Cloudflare R2 / AWS S3 (multipart uploads for video chunks)
- **AI Processing**: Google Gemini API for transcript analysis and metadata generation
- **Video Tools**: `ffmpeg` + `yt-dlp` for raw asset downloading and frame rendering

---

## 📂 Project Structure

```text
├── .github/workflows/   # CI/CD Workflows (GitHub Actions)
├── docker/              # Production-grade Dockerfiles
│   ├── app.Dockerfile   # Next.js standalone server
│   └── worker.Dockerfile# Background video processors
├── prisma/              # Prisma Database schemas & migrations
├── scripts/             # Utility and load testing scripts
└── src/
    ├── app/             # Next.js application routes & API endpoints
    ├── env.ts           # Zod schema validation for configurations
    ├── lib/             # Shared helpers (Prisma, Redis, Logging, Idempotency)
    ├── server/          # Decoupled core backend services
    │   ├── events/      # In-process pub/sub event bus
    │   ├── services/    # Asset & Subscription Managers
    │   └── workers/     # BullMQ worker handlers (Download, Transcribe, Render)
    └── tests/           # Integration & End-to-End test suites
```

---

## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: v20 or newer
- **Docker & Docker Compose**: For local infrastructure services
- **PostgreSQL & Redis** (if running bare metal instead of Docker)

### 2. Environment Configuration

Clone the environment template and configure your local credentials:

```bash
cp .env.example .env
```

Ensure the following configuration variables are set in `.env`:
- `DATABASE_URL`: Connection string for PostgreSQL
- `REDIS_HOST` & `REDIS_PORT`: Configuration for BullMQ queue state
- `CLERK_SECRET_KEY` & `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk Auth keys
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Stripe payment keys
- `GEMINI_API_KEY`: API credentials for Google Gemini model

---

## 💻 Local Development

### 1. Install Dependencies

Install all package dependencies. This will also automatically run `prisma generate` to compile the database client types:

```bash
npm install
```

### 2. Database Migrations

Apply local database schema changes and verify validation:

```bash
npx prisma validate
npx prisma db push
```

### 3. Run Development Servers

Start the Next.js application and the background workers concurrently:

**Start Next.js (Port 3000)**:
```bash
npm run dev
```

**Start BullMQ Background Workers**:
```bash
npm run start:worker
```

---

## 🐳 Docker Deployment (Production-Ready)

This repository includes highly optimized multi-stage Dockerfiles designed for secure, rootless, and lightweight production environments.

### 1. Build Production Images

```bash
# Build the Next.js Standalone web server
docker build -f docker/app.Dockerfile -t shortcut-app:latest .

# Build the Background processor worker
docker build -f docker/worker.Dockerfile -t shortcut-worker:latest .
```

### 2. Run Entire Environment Locally via Compose

Ensure you populate your `.env` variables, then spin up PostgreSQL, Redis, Next.js, and the worker container together:

```bash
docker-compose up --build
```

---

## 🛡️ Code Quality & CI/CD

Our CI/CD pipeline runs on every push and PR to `main` via GitHub Actions:
- **Type Checking**: Strict type checking using TypeScript compiler (`npm run typecheck`).
- **ESLint**: Linting checks and standard enforcement (`npm run lint`).
- **Prisma**: Validates schema syntax and formatting prior to builds (`npx prisma validate`).
- **Docker**: Pre-compiles and builds Docker containers to prevent image degradation.
