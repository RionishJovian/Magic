# Multi-stage build: dependencies → build → runtime
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN npm install -g bun && bun install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.json vite.config.ts ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm install -g bun && bun run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install Bun runtime
RUN npm install -g bun

# Copy built application and node_modules from builder
COPY --from=builder /app/.output ./.output
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

CMD ["bun", "run", "--cwd", ".output", "server"]
