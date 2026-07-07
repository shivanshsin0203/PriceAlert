# PriceAlert backend — one image, two services (api / worker pick the command
# in docker-compose.yml). Multi-stage: TS builds in stage 1, runtime ships dist
# + production deps only. Migrations run from a laptop against Neon (drizzle-kit
# stays a devDependency; it is not needed at runtime).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
