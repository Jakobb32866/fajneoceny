# syntax=docker/dockerfile:1

# ---- build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY BackendApi.csproj ./
RUN dotnet restore BackendApi.csproj

COPY . .
RUN dotnet publish BackendApi.csproj -c Release -o /app/publish --no-restore

# ---- runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# NOTE: this image deliberately ships NO speech engine. Text-to-speech runs
# through Google Cloud (Tts:Provider=Google), so there is nothing to install
# and no ~60 MB voice model to bake in — the image is far smaller and builds
# in a fraction of the time.
#
# The local Piper backend is still supported in code (Tts:Provider=Piper) for
# offline development, but it needs the piper binary and a .onnx voice on the
# host. To run it inside this image again, restore the apt/wget block that
# fetched piper + pl_PL-gosia-medium (see git history for this file).

# /app must be writable by the non-root "app" user, and /app/data is where
# everything that must SURVIVE A REBUILD lives (the SQLite database and
# uploaded files). docker-compose mounts a named volume there.
#
# Creating it here, owned by app, is load-bearing: Docker copies ownership
# from the image when a named volume is first mounted onto an existing path,
# but creates it root-owned if the path is missing — and the app user could
# then not write to its own database.
RUN mkdir -p /app/data/storage && chown -R app:app /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080

COPY --from=build --chown=app:app /app/publish .

USER app

EXPOSE 8080

ENTRYPOINT ["dotnet", "BackendApi.dll"]
