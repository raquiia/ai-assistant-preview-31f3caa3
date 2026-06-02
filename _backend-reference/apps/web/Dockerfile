FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev:web"]
