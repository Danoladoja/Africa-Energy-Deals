FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/energy-tracker/package.json artifacts/energy-tracker/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/ lib/
COPY scripts/package.json scripts/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.js"]
