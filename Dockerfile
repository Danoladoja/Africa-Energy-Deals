FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/energy-tracker run build && pnpm --filter @workspace/api-server run build

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.js"]
