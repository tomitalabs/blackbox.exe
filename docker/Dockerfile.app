FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV AI_PROVIDER=ollama
ENV OLLAMA_BASE_URL=http://ollama:11434
ENV OLLAMA_MODEL=qwen2.5:0.5b
ENV AI_TIMEOUT_MS=220

CMD ["npm", "run", "dev"]
