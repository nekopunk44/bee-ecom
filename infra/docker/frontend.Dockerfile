FROM node:22.22.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/storefront/package.json apps/storefront/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

FROM dependencies AS source
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

FROM source AS storefront-build
ARG SITE_URL=http://localhost:8080
ENV SITE_URL=${SITE_URL}
RUN npm run build -w @bee/storefront

FROM node:22.22.0-bookworm-slim AS storefront
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 API_INTERNAL_URL=http://api:8080
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=storefront-build --chown=node:node /app/apps/storefront/dist ./dist
USER node
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]

FROM source AS admin-build
RUN npm run build -w @bee/admin

FROM nginxinc/nginx-unprivileged:1.28-alpine AS admin
COPY infra/nginx/admin.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 8080

FROM dependencies AS migrate
ENV NODE_ENV=production
COPY infra/scripts/migrate.mjs infra/scripts/migration-plan.mjs ./infra/scripts/
COPY database/migrations ./database/migrations
USER node
CMD ["node", "infra/scripts/migrate.mjs"]
