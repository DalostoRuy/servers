FROM node:20-bookworm-slim

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

# Criar diretório de trabalho
WORKDIR /project

# Copiar package.json e instalar dependências
COPY package.json /project/
RUN npm install \
    && npm install puppeteer-extra puppeteer-extra-plugin-stealth

# Copiar arquivos restantes
COPY tsconfig.json /project/
COPY index.ts /project/

# Compilar TypeScript usando modo mais permissivo
RUN npx tsc --skipLibCheck

# Permitir execução do arquivo
RUN chmod +x dist/*.js

ENTRYPOINT ["node", "dist/index.js"]
