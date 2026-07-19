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
