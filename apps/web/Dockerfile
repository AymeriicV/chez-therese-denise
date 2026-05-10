FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml /app/
COPY apps/web/package.json /app/apps/web/package.json
COPY packages/db/package.json /app/packages/db/package.json
RUN pnpm install --filter @ctd/web --filter @ctd/db --frozen-lockfile=false

COPY packages/db /app/packages/db
COPY apps/web /app/apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p .next && find .next -mindepth 1 -maxdepth 1 -exec rm -rf {} + && pnpm dev --hostname 0.0.0.0"]
