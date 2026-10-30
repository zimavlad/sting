FROM node:22-slim AS build

WORKDIR /app

# Coolify підставляє NODE_ENV=production ще на збірці образу, тому --include=dev
# обов'язковий: без нього не встановиться vite і білд впаде.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Залежностей на рантаймі нема — adapter-node збирає все в build/.
FROM node:22-slim

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/build ./build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "build/index.js"]
