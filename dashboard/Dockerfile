FROM oven/bun:1-alpine
WORKDIR /app/dashboard

# Install python3 for scripts and redis-cli for cache management
RUN apk add --no-cache python3 py3-pip redis

COPY package.json bun.lock ./
RUN bun install

# The rest of the files will be mounted via docker-compose volumes
EXPOSE 3000
CMD ["bun", "run", "dev"]
