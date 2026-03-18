FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN pnpm -r --if-present run build

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.js"]
