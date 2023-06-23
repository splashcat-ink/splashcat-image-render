ARG DENO_VERSION=1.31.1
FROM denoland/deno:$DENO_VERSION

# ↑ https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#chrome-headless-doesnt-launch-on-unix
RUN apt-get -qq update \
    && apt-get -qq install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
# ↓ Added based on the information obtained from by console.log(line) at https://deno.land/x/puppeteer@16.2.0/src/deno/BrowserRunner.ts#L168.
    libdrm2 \
    libxkbcommon0 \
    libxshmfence1 \
    && apt-get -y -qq autoremove \
    && apt-get -qq clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# --- PLACE CUSTOM COMMANDS BELOW --- #

# https://deno.land/x/puppeteer@9.0.2#installation
# In your real script, replace the installation script with https://deno.land/x/puppeteer@9.0.2/install.ts
RUN PUPPETEER_PRODUCT=chrome deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts

WORKDIR /app
COPY deps.ts deps.ts
RUN deno cache deps.ts

EXPOSE 3000

COPY . .
RUN deno cache main.ts

ENTRYPOINT ["deno"]
CMD ["run", "-A", "main.ts"]