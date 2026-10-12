FROM node:22-alpine
WORKDIR /app
COPY index.mjs ./index.mjs
ENV NODE_ENV=production
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node","index.mjs"]
