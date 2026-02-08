# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# runtime needs compiled backend + built frontend
COPY --from=build /app/dist-backend ./dist-backend
COPY --from=build /app/dist ./dist

# if backend runtime imports anything from shared at runtime:
COPY --from=build /app/shared ./shared

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "dist-backend/server.js"]