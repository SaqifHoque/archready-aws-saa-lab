FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx index.html styles.css app.js learning.js services.js cloud-config.js cloud-sync.js /usr/share/nginx/html/
COPY --chown=nginx:nginx docker/cloud-config.js /usr/share/nginx/html/cloud-config.js
COPY --chown=nginx:nginx data /usr/share/nginx/html/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
