FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV PORT=3000
ENV BASE_PATH=/

RUN pnpm --filter @workspace/energy-tracker run build

RUN pnpm add -w tsx express

EXPOSE 3000

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm --filter @workspace/db run push-force && pnpm exec tsx railway-server.mjs"]
