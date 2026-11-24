FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 300000
COPY . .
# Baked in at build time (Vite). Pass with --build-arg.
ARG VITE_SERVER_URL
ARG VITE_LIFF_ID=""
ARG VITE_SANDBOX=false
ENV VITE_SERVER_URL=$VITE_SERVER_URL VITE_LIFF_ID=$VITE_LIFF_ID VITE_SANDBOX=$VITE_SANDBOX
RUN yarn build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
