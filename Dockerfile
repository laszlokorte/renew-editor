FROM node:23 AS builder

WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
CMD ["npm", "run", "build"]

FROM nginx

COPY ./deployment_config/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html