FROM node:23 AS builder

ARG BASE_PATH="/"
ARG APP_NAME="Petri Station"
ARG HTML_HEAD_INJECT='\
    <!--# if expr="$ssi_knownapi" -->\
    <meta name="env_known_api" content="<!--# echo var="ssi_knownapi" -->">\
    <!--# endif -->\
    <!--# if expr="$ssi_appname" -->\
    <meta name="env_app_title" content="<!--# echo var="ssi_appname" -->">\
    <!--# endif -->\
    <!--# if expr="$ssi_baseurl" -->\
    <meta name="env_base_url" content="<!--# echo var="ssi_baseurl" -->">\
    <!--# endif -->'

WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .

ENV VITE_APP_NAME=${APP_NAME}
ENV PUBLIC_HTML_HEAD_INJECT=${HTML_HEAD_INJECT}
ENV BASE_PATH=${BASE_PATH}

RUN ["npm", "run", "build"]

FROM nginx

ARG BASE_PATH="/"

COPY ./deployment_config/nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/build /usr/share/nginx/html

ENV EDITOR_KNOWN_API="label=Local, url=http://localhost:8000"
ENV EDITOR_APP_NAME="Petri Station"
ENV BASE_PATH=${BASE_PATH}