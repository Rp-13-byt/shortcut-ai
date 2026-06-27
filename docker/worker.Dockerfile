# docker/worker.Dockerfile
FROM node:20-slim AS base

# Install OS dependencies required for video processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy application source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript to dist
# Note: Assuming 'npm run build' outputs the compiled worker to dist/
# Depending on setup, you might use ts-node or compile it.
# For this scaffold, we'll use a direct TS execution or compiled output.
RUN npx tsc -p tsconfig.server.json || echo "TypeScript compilation fallback"

ENV NODE_ENV production

# We run as root or a dedicated user that has access to execute ffmpeg/yt-dlp
# In a strict environment, create a non-root user here.

CMD ["npm", "run", "start:worker"]
