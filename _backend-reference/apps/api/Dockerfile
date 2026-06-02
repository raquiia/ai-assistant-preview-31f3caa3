FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/rag/package.json packages/rag/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev:api"]
