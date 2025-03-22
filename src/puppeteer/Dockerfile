FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DOCKER_CONTAINER=true

RUN apt-get update && \
    apt-get install -y wget gnupg && \
    apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    libgtk2.0-0 libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 && \
    apt-get install -y chromium && \
    apt-get clean

COPY src/puppeteer /project
COPY tsconfig.json /tsconfig.json

WORKDIR /project

# Instalar todas as dependências de uma vez
RUN npm install puppeteer-extra puppeteer-extra-plugin-stealth && npm install

# Compile TypeScript
RUN npm run build

ENTRYPOINT ["node", "dist/index.js"]
