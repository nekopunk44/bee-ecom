FROM debian:trixie-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake ninja-build git ca-certificates \
    libjsoncpp-dev libssl-dev zlib1g-dev uuid-dev libpq-dev libhiredis-dev \
    pkg-config libsodium-dev libvips-dev libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*
ARG DROGON_VERSION=v1.9.11
RUN git clone --branch ${DROGON_VERSION} --depth 1 --recurse-submodules --shallow-submodules \
      https://github.com/drogonframework/drogon.git /src/drogon \
    && cmake -S /src/drogon -B /src/drogon-build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_EXAMPLES=OFF \
      -DBUILD_CTL=OFF -DBUILD_TESTING=OFF -DBUILD_ORM=ON -DBUILD_POSTGRESQL=ON \
      -DBUILD_MYSQL=OFF -DBUILD_SQLITE3=OFF -DBUILD_REDIS=ON \
    && cmake --build /src/drogon-build --parallel 2 \
    && cmake --install /src/drogon-build
WORKDIR /src/bee
COPY CMakeLists.txt ./
COPY services ./services
RUN cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON \
    && cmake --build build --parallel 2 \
    && ctest --test-dir build --output-on-failure

FROM debian:trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libjsoncpp26 libssl3t64 zlib1g libuuid1 libpq5 libhiredis1.1.0 \
    libsodium23 libvips42t64 libcurl4t64 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home bee
COPY --from=build /src/bee/build/bee-api /usr/local/bin/bee-api
COPY --from=build /src/bee/build/bee-worker /usr/local/bin/bee-worker
COPY --from=build /src/bee/build/bee-admin-create /usr/local/bin/bee-admin-create
USER 10001
EXPOSE 8080
CMD ["bee-api"]
