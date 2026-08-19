FROM denoland/deno:alpine-2.9.5

# Set working directory inside container
WORKDIR /app

# Cache dependencies
COPY deno.json deno.loc[k] ./
RUN deno install

# Copy application source code
COPY . .

# Generate Prisma Client during image build time (safe fallback database URL lookup is active)
RUN deno task db:generate

# Expose server port (Google Cloud Run automatically sets the PORT environment variable)
EXPOSE 8000

# Run the API server with required Deno permissions (instantly starts and avoids health check timeouts)
CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-sys", "src/index.ts"]
