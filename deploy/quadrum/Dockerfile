# API-only release: preserve the already deployed Flutter/Nginx runtime exactly.
ARG IOE_RUNTIME_IMAGE
FROM node:20-alpine AS api_build
WORKDIR /api
COPY . .
RUN npm ci && npm run build

FROM ${IOE_RUNTIME_IMAGE}
ARG IOE_API_COMMIT
LABEL ioe.api.commit=$IOE_API_COMMIT
WORKDIR /srv/api
COPY --from=api_build /api/dist ./dist
COPY --from=api_build /api/node_modules ./node_modules
COPY --from=api_build /api/package.json /api/package-lock.json ./
