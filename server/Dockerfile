FROM node:20-alpine

WORKDIR /app

# نسخ ملفات الحزم وتثبيتها
COPY package*.json ./
RUN npm install --omit=dev

# نسخ كود المشروع
COPY server/ ./server/
COPY database/ ./database/

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server/hr-backend.js"]
