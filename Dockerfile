# Builder stage: compiles native deps (better-sqlite3) against the same
# base image the runtime stage uses. Kept separate from the runtime stage
# because the build tools it needs (python3/make/g++) can't just be apt-purged
# afterwards — python3 is a hard dependency of this image's nodejs package, so
# purging it takes node down too. Copying only the finished node_modules out
# avoids that trap entirely.
FROM mcr.microsoft.com/playwright:v1.61.1-noble AS builder

WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci

FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

CMD ["node", "src/index.js"]
