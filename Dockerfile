FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.12.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build server
RUN pnpm build:server

# Expose port
EXPOSE 3000

# Start with database migration
CMD ["sh", "-c", "pnpm db:push && pnpm start"]
