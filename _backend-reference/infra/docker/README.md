# Docker local

The root `docker-compose.yml` starts the complete local-first stack:

- `web` React/Vite console on `http://localhost:5173`
- `api` Fastify API on `http://localhost:4000`
- `worker` ingestion worker shell
- `postgres`, `redis`, `opensearch`, `minio`

For a production-like local database flow:

```bash
docker compose up -d postgres redis opensearch minio
npm install
npm run db:migrate
npm run seed
npm run dev
```

The API currently ships with an in-memory demo repository so the product path runs immediately even before Prisma persistence is wired as the active repository implementation.
