FROM node:20-alpine AS dependencies
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY database/init ./database/init
RUN mkdir -p /app/.data/imports && chown -R node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
