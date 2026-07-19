FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci \
    && apt-get purge -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY . .

CMD ["node", "src/index.js"]
