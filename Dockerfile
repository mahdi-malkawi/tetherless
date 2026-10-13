# Playwright base image ships Chromium + all system deps, so the browser runner
# works out of the box. Remove it and use node:20-slim if you only need command/http.
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

# git is needed for the bus; present in the base image.
ENV NODE_ENV=production
CMD ["node", "src/agent.js"]
