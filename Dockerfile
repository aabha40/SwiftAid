# ─────────────────────────────────────────────────────────
# Dockerfile — SwiftAid Backend
# ─────────────────────────────────────────────────────────
#
# FROM: which base image to use
# node:20-alpine = Node.js 20 on Alpine Linux
# Alpine is a tiny Linux distro (5MB vs 900MB for Ubuntu)
# Perfect for containers — small = fast to build and deploy
#
FROM node:20-alpine

# Set working directory inside container
# All subsequent commands run from this folder
WORKDIR /app

# Copy package files FIRST (before copying all code)
# WHY? Docker caches layers. If package.json hasn't changed,
# npm install uses the cached layer — much faster rebuilds
COPY package*.json ./

# Install only production dependencies
# --omit=dev skips devDependencies (nodemon etc) — smaller image
RUN npm install --omit=dev

# Copy all server code into the container
COPY server/ ./server/



# Expose the port our server listens on
# This is documentation — Railway also needs PORT env variable
EXPOSE 5000

# Health check — Railway uses this to know if app is running
# Every 30s, curl hits /health. If it fails 3 times → restart
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Start command
CMD ["node", "server/index.js"]