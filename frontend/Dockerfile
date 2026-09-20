# syntax=docker/dockerfile:1
#
# Runs the Expo dev server. Serves both the web build (http://localhost:8081)
# and the native JS bundle that Expo Go on a phone connects to.
#
# The container's own IP is not reachable from a phone, so the compose file
# sets REACT_NATIVE_PACKAGER_HOSTNAME to the host machine's LAN IP. Expo then
# advertises that address instead of 172.x, and src/api/config.ts derives the
# backend URL from it correctly.

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8081
CMD ["npx", "expo", "start", "--host", "lan"]
