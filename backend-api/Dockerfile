# syntax=docker/dockerfile:1

# ---- build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY BackendApi.csproj ./
RUN dotnet restore BackendApi.csproj

COPY . .
RUN dotnet publish BackendApi.csproj -c Release -o /app/publish --no-restore

# ---- runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

# /app must be writable by the non-root "app" user: the SQLite db file and
# the uploaded-file storage directory both get created here at runtime.
RUN chown app:app /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080

COPY --from=build --chown=app:app /app/publish .

USER app

EXPOSE 8080

ENTRYPOINT ["dotnet", "BackendApi.dll"]
