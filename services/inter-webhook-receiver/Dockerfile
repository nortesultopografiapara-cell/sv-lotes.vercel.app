# Receptor mTLS Inter — sem dependências npm.
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8443
ENV HOST=0.0.0.0

COPY package.json ./
COPY src ./src
COPY test ./test

# Sanity check no build (não precisa de secrets)
RUN node --test test/*.test.js

USER node
EXPOSE 8443

CMD ["node", "src/server.js"]
