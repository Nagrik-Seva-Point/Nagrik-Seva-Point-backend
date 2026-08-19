FROM denoland/deno:alpine-2.9.5

# Set working directory inside container
WORKDIR /app

# Cache dependencies
COPY deno.json deno.loc[k] ./
RUN deno install

# Copy application source code
COPY . .

# Expose server port (Google Cloud Run automatically sets the PORT environment variable)
EXPOSE 8000

# Generate Prisma Client and run the API server with required Deno permissions at startup
CMD ["sh", "-c", "deno task db:generate && deno run --allow-net --allow-read --allow-write --allow-env --allow-sys src/index.ts"]
