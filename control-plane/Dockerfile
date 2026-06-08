FROM oven/bun:1-slim

WORKDIR /app

# Copy the pre-downloaded OPA CLI binary from host build context
COPY opa /usr/local/bin/opa
RUN chmod +x /usr/local/bin/opa

# Copy pre-installed node_modules and configurations from host
COPY package.json ./
COPY node_modules ./node_modules

# Copy application code
COPY index.ts ./

EXPOSE 8183

CMD ["bun", "run", "index.ts"]
