FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig*.json ./

RUN npm run build:client
RUN npm run build:server

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/client ./dist/client

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/server/server.js"]
