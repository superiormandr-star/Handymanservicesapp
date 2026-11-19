FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data && chown -R node:node /app /data
ENV NODE_ENV=production PORT=3000 DATA_FILE=/data/proconnect.json
EXPOSE 3000
CMD ["sh", "./scripts/start-railway.sh"]
