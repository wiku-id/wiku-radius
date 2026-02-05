# Wiku Radius - Dockerfile
# Lightweight RADIUS Server for Mini PCs

FROM node:18-alpine

LABEL maintainer="wiku.my.id"
LABEL description="Open Source RADIUS Server"

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# Expose ports
# 1812/udp - RADIUS Authentication
# 1813/udp - RADIUS Accounting
# 3000/tcp - Dashboard
EXPOSE 1812/udp 1813/udp 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV RADIUS_AUTH_PORT=1812
ENV RADIUS_ACCT_PORT=1813
ENV DASHBOARD_PORT=3000
ENV DATABASE_PATH=./data/wiku-radius.db
ENV LOG_LEVEL=info

# Run as non-root user for security
RUN addgroup -g 1001 -S wiku && \
    adduser -u 1001 -S wiku -G wiku && \
    chown -R wiku:wiku /app

USER wiku

# Start server
CMD ["node", "src/index.js"]
