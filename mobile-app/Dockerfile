# syntax=docker/dockerfile:1
#
# Runs the Expo dev server. A single Metro instance serves:
#   - the web build, viewable directly in a browser
#   - the native JS bundle, loaded by the Expo Go app on a phone/emulator
#     scanning the QR code Expo prints on start
#
# For a phone on the same network to reach this container, set
# REACT_NATIVE_PACKAGER_HOSTNAME to the host machine's LAN IP when running,
# e.g.: docker run -e REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.50 ...

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8081

CMD ["npx", "expo", "start", "--host", "lan"]
