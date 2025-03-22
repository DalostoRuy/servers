FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DOCKER_CONTAINER=true

# Instalar dependências do sistema
RUN apt-get update && \
    apt-get install -y wget gnupg fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg \
    fonts-kacst fonts-freefont-ttf libxss1 libgtk2.0-0 libnss3 libatk-bridge2.0-0 \
    libdrm2 libxkbcommon0 libgbm1 libasound2 chromium && \
    apt-get clean

# Copiar arquivos de configuração primeiro para melhorar o cache
WORKDIR /project
COPY tsconfig.json /project/tsconfig.json
COPY package.json /project/package.json

# Instalar dependências do Node
RUN npm install

# Copiar código fonte
COPY src/puppeteer/ /project/

# Instalar dependências extras
RUN npm install puppeteer-extra puppeteer-extra-plugin-stealth --save

# Compilar TypeScript
RUN npm run build

ENTRYPOINT ["node", "dist/index.js"]
