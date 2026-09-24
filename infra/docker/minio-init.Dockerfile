FROM alpine:3.22.2 AS fetch
RUN apk add --no-cache ca-certificates curl
ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
ARG MC_SHA256=01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891
RUN curl --fail --location --silent --show-error \
      "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-amd64.${MC_VERSION}" \
      --output /usr/local/bin/mc \
    && echo "${MC_SHA256}  /usr/local/bin/mc" | sha256sum --check \
    && chmod 0555 /usr/local/bin/mc

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates \
    && addgroup -S bee && adduser -S -G bee bee \
    && mkdir -p /home/bee && chown bee:bee /home/bee
COPY --from=fetch --chown=bee:bee /usr/local/bin/mc /usr/local/bin/mc
ENV HOME=/tmp
USER bee
ENTRYPOINT ["mc"]
