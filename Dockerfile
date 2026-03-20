FROM node:20-slim

# Install chromium-browser and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium-browser \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Copy application code
COPY . .

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Start the app
CMD ["npm", "start"]
