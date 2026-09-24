FROM alpine:3.22.2 AS fetch
RUN apk add --no-cache ca-certificates curl
ARG MINIO_VERSION=RELEASE.2025-09-07T16-13-09Z
ARG MINIO_SHA256=7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f
RUN curl --fail --location --silent --show-error \
      "https://github.com/minio/minio/releases/download/${MINIO_VERSION}/minio.linux-amd64.${MINIO_VERSION}" \
      --output /usr/local/bin/minio \
    && echo "${MINIO_SHA256}  /usr/local/bin/minio" | sha256sum -c - \
    && chmod 0555 /usr/local/bin/minio

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates curl \
    && addgroup -S -g 10001 bee \
    && adduser -S -D -H -u 10001 -G bee bee \
    && mkdir -p /data \
    && chown bee:bee /data
COPY --from=fetch --chown=bee:bee /usr/local/bin/minio /usr/local/bin/minio
USER 10001
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
