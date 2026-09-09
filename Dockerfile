FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm --prefix frontend ci --no-audit --no-fund \
  && npm --prefix backend ci --no-audit --no-fund

COPY frontend ./frontend
COPY backend ./backend
RUN npm --prefix frontend run build \
  && npm --prefix backend run build

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev --no-audit --no-fund

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/assets ./backend/assets
COPY --from=build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV LIBREOFFICE_BIN=libreoffice
ENV UPLOAD_PATH=/data/uploads
# Фото склада ТС ОБЯЗАНЫ жить на персистентном томе (/data): без этих
# переменных они писались в каталог контейнера и умирали при каждом перекате
# (баг стейджа 09.09 — «битые фотографии» после деплоя).
ENV WAREHOUSE_UPLOAD_PATH=/data/uploads/warehouse
ENV WAREHOUSE_TUS_TEMP_PATH=/data/uploads/warehouse-tus-temp
ENV WAREHOUSE_PHOTO_BACKUP_PATH=/data/warehouse-photo-backups

EXPOSE 3000

CMD ["node", "backend/dist/index.js"]
