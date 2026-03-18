FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV PORT=3000
ENV NODE_ENV=production
ENV BASE_PATH=/

RUN pnpm --filter @workspace/energy-tracker run build
RUN pnpm --filter @workspace/api-server run build

RUN echo "=== api-server dist contents ===" && ls -la artifacts/api-server/dist/ 2>/dev/null || echo "No dist folder found" && echo "=== api-server root ===" && ls artifacts/api-server/ 2>/dev/null

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.js"]
