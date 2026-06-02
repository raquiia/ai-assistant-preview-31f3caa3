FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/rag/package.json packages/rag/package.json
RUN npm install
COPY . .
CMD ["npm", "run", "dev:worker"]
