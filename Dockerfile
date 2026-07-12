FROM node:20-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create uploads & logs directories
RUN mkdir -p uploads logs

EXPOSE 3002

# Use node directly (no PM2 inside container – Docker handles restart)
CMD ["node", "src/server.js"]