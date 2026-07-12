# syntax=docker/dockerfile:1
#
# Runs the Expo dev server in web-only mode, viewable directly in a browser
# at http://localhost:8081.

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8081

CMD ["npx", "expo", "start", "--web", "--host", "lan"]
