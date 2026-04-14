FROM arm64v8/node:20-slim

# Install Playwright system deps + Chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright@1.52.0 install --with-deps chromium

# Copy launch script
WORKDIR /app
COPY launch-server.js .

# Install playwright as runtime dependency
RUN npm init -y && npm install playwright@1.52.0

EXPOSE 3000

CMD ["node", "launch-server.js"]
