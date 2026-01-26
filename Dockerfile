# ---- build frontend ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app

# install backend deps
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# copy backend + built frontend
COPY --from=build /app/backend ./backend
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "backend/server.js"]
