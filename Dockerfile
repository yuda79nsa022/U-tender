# Development image — runs `next dev` with hot reload via a mounted
# volume (see docker-compose.yml). For a production image you'd want a
# separate multi-stage build that runs `next build` + `next start`
# instead; this one prioritizes convenience for local/XAMPP-alternative use.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
