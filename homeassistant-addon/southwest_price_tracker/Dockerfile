# Self-contained add-on image: only better-sqlite3 is needed (no
# playwright/chromium — this add-on never scrapes, just reads the db), so it
# builds its own minimal node_modules rather than reusing the main
# southwest-price-notifier image, keeping this add-on independently
# buildable/updatable.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm init -y && npm install better-sqlite3@^11.3.0

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY app/src ./src

# config/ and data/ aren't duplicated into this image — they're symlinked to
# the same files the southwest-price-notifier-loop container reads/writes,
# reached via the `share:rw` map in config.yaml (HAOS's /share, where the
# main repo checkout already lives per DEPLOY-NOTES.md). `ln -s` doesn't
# require the target to exist yet, so this is safe at build time even
# though /share isn't mounted until the container actually runs.
RUN ln -s /share/southwest-price-notifier/config /app/config \
    && ln -s /share/southwest-price-notifier/data /app/data

# Must match config.yaml's ingress_port.
ENV PORT=9786
CMD ["node", "src/server.js"]
