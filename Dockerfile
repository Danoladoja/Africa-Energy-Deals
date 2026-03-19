FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV PORT=3000
ENV NODE_ENV=production
ENV BASE_PATH=/

RUN pnpm --filter @workspace/energy-tracker run build

EXPOSE 3000

CMD ["npx", "tsx", "railway-server.mjs"]
