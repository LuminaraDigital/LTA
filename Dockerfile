FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.json vitest.config.ts ./
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY src ./src
COPY test ./test
COPY .env.example ./.env.example
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
