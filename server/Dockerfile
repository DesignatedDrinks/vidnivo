FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache su-exec \
    && mkdir -p /var/data \
    && chown node:node /var/data
COPY index.mjs social.mjs creator.mjs ./
COPY start.sh ./start.sh
RUN chmod 755 /app/start.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "/app/start.sh"]
