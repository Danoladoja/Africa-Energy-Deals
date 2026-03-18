FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV PORT=3000
ENV NODE_ENV=production
ENV BASE_PATH=/

RUN pnpm --filter @workspace/energy-tracker run build

RUN ls -la artifacts/api-server/dist/ 2>/dev/null || echo "No dist dir"
RUN find artifacts/api-server -name "*.js" -path "*/dist/*" 2>/dev/null || echo "No JS in dist"
RUN pnpm --filter @workspace/api-server run build || echo "api-server build failed, will use tsx"

EXPOSE 3000

CMD ["npx", "tsx", "artifacts/api-server/src/index.ts"]
