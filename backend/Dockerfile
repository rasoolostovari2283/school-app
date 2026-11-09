FROM node:20-bookworm-slim

# Install compilation tools needed for native node modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure upload directory exists and is owned by non-root node user (#35/A22)
RUN mkdir -p uploads && chown -R node:node /app

# Expose backend port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Run as non-root user
USER node

# Run backend
CMD ["node", "src/app.js"]
