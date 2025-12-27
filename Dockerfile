FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace configs
COPY package.json pnpm-workspace.yaml ./

# Copy package manifests
COPY packages/gateway-api/package.json ./packages/gateway-api/
COPY packages/gateway-core/package.json ./packages/gateway-core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/gateway-core ./packages/gateway-core
COPY packages/gateway-api ./packages/gateway-api

# Build packages
RUN pnpm --filter @secure-mcp-gateway/core build
RUN pnpm --filter @secure-mcp-gateway/api build

# Production image
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and dependencies
# Note: In a real production setup, we would prune devDependencies
COPY --from=builder /app/packages/gateway-api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/gateway-api/package.json ./package.json

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]

