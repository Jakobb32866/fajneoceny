# syntax=docker/dockerfile:1

# ---- build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY BackendApi.csproj ./
RUN dotnet restore BackendApi.csproj

COPY . .
RUN dotnet publish BackendApi.csproj -c Release -o /app/publish --no-restore

# ---- runtime stage ----
# Debian-based (not alpine): Piper ships prebuilt glibc binaries and glibc
# onnxruntime, which don't run on alpine's musl without extra shims.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Piper TTS: the official prebuilt standalone binary (bundles its own
# onnxruntime) is unpacked to /opt/piper and symlinked onto PATH, plus a
# Polish voice model (.onnx + .onnx.json) from the official voices repo.
# TARGETARCH is set automatically by buildkit; map it to piper's asset names
# so the image is correct on both amd64 and arm64 hosts.
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates \
    && case "$TARGETARCH" in \
         amd64) PIPER_ARCH=x86_64 ;; \
         arm64) PIPER_ARCH=aarch64 ;; \
         *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
       esac \
    && wget -qO /tmp/piper.tar.gz \
        "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${PIPER_ARCH}.tar.gz" \
    && tar -xzf /tmp/piper.tar.gz -C /opt \
    && ln -s /opt/piper/piper /usr/local/bin/piper \
    && rm /tmp/piper.tar.gz \
    && mkdir -p /app/voices \
    && wget -qO /app/voices/pl_PL-gosia-medium.onnx \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx?download=true" \
    && wget -qO /app/voices/pl_PL-gosia-medium.onnx.json \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx.json?download=true" \
    && apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# /app must be writable by the non-root "app" user: the SQLite db file and
# the uploaded-file storage directory both get created here at runtime.
RUN chown app:app /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080

COPY --from=build --chown=app:app /app/publish .

USER app

EXPOSE 8080

ENTRYPOINT ["dotnet", "BackendApi.dll"]
