FROM node:22-alpine
WORKDIR /app
COPY package.json server.js estimate-routes.js crm-routes.js storage-tool.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
