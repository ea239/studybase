# syntax=docker/dockerfile:1

FROM node:24-slim AS base
# openssl is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed for `prisma generate` to resolve the datasource;
# the real database is mounted at runtime.
ENV DATABASE_URL="file:/app/data/studybase.db"
RUN npx prisma generate && npm run build

# Migrations run from here, not from the runtime image: the Prisma CLI pulls in
# a long tail of dependencies that Next's standalone trace deliberately omits,
# and chasing them package by package is a losing game.
FROM base AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
CMD ["node", "./node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# poppler-utils supplies pdftoppm, used to render the slide behind a cited page.
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

# Next's standalone bundle, plus the assets it does not trace.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# The generated client only — schema and CLI live in the migrator stage.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# pdfjs reaches for @napi-rs/canvas to provide DOMMatrix. It is an optional
# dependency, so Next's dependency trace skips it and every PDF path then fails
# with "DOMMatrix is not defined".
COPY --from=builder /app/node_modules/@napi-rs ./node_modules/@napi-rs

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
