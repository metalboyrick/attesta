# Seller only: holds no keys. Build from the services/ directory so the
# shared SpendRecord type is in context:
#   docker build -f x402-cardano/Dockerfile -t attesta-x402-cardano .
FROM node:22-slim
WORKDIR /app/x402-cardano
COPY x402-cardano/package.json x402-cardano/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY x402-cardano/tsconfig.json ./
COPY x402-cardano/src ./src
COPY shared /app/shared
ENV NODE_ENV=production SELLER_PORT=4021 TRUST_PROXY=1 RECEIPTS_FILE=/tmp/attesta/receipts.json
EXPOSE 4021
USER node
CMD ["npx", "tsx", "src/seller.ts"]
