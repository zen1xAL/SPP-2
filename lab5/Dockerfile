FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json ./
COPY client/tsconfig.json ./client/
RUN npm ci

COPY client/ ./client/
COPY server/ ./server/
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data

EXPOSE 4000

CMD ["node", "dist/server/server.js"]

