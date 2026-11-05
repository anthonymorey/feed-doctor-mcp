# Local stdio build for directory health checks (e.g. Glama). Read-only; needs your own Google/Microsoft tokens via env to return data.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev
CMD ["node", "dist/cli.js", "stdio"]
