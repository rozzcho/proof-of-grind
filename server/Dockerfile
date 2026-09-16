# The server runs the API and the Discord bot in one long-lived process.
FROM node:26-alpine

WORKDIR /app

# The server reads the program IDL from the app folder.
COPY app/src/idl ./app/src/idl
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/src ./server/src

ENV NODE_ENV=production
# Mount a volume here so the time-tracking database survives restarts.
ENV DB_PATH=/data/grind.db
EXPOSE 8787

WORKDIR /app/server
CMD ["node", "src/index.ts"]
