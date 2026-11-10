# Old London Pub — self-hostable full stack (Node API + static PWA)
# Build:  docker build -t old-london-pub .
# Run:    docker run -p 3000:3000 -v olp-data:/app/www old-london-pub
#         (the -v persists olp-data.json across container restarts)
FROM node:18-alpine

WORKDIR /app

# Install the Node API dependency (web-push powers real Web Push delivery).
COPY www/package.json www/package-lock.json ./www/
RUN cd www && (npm ci --omit=dev || npm install --omit=dev)

# Copy the application: static site + server + shared domain core.
COPY www/ ./www/

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000

WORKDIR /app/www
CMD ["node", "server.js"]
