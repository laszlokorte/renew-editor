FROM node:23 AS builder

ARG APP_NAME="XXPetri StationXX"
ARG HTML_HEAD_INJECT='<meta name="known_api" content="<!--# echo var="knownapi" -->">'

WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .

ENV VITE_APP_NAME=${APP_NAME}
ENV PUBLIC_HTML_HEAD_INJECT=${HTML_HEAD_INJECT}

RUN ["npm", "run", "build"]

FROM nginx

COPY ./deployment_config/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html