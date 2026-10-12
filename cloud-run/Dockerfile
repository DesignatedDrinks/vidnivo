FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY src ./src
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","src/index.mjs"]
