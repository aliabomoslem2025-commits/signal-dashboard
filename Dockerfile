FROM nginx:1.27-alpine
ENV SIGNAL_SERVER_UPSTREAM=http://signal-server:8080
ENV NGINX_ENVSUBST_FILTER=^SIGNAL_SERVER_UPSTREAM$
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY index.html styles.css app.js /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
