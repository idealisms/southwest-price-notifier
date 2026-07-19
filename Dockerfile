FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["node", "src/index.js"]
