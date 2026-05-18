---
phase: 7
title: "Docker & Deployment"
priority: Medium
status: Pending
effort: 2h
depends_on: [5]
---

# Phase 07 — Docker & Deployment

## Context Links
- [Plan Overview](plan.md)
- [Brainstorm Report](../reports/brainstorm-260225-1018-central-file-management-service.md)

## Overview
Create Docker multi-stage build, docker-compose for local dev (API + Redis), and IIS deployment config. SQL Server (`10.14.142.30\BTP`) and MinIO (`10.14.142.32:9000`) are external — not in compose.

## Key Insights
- Multi-stage Docker build: SDK for build, ASP.NET runtime for run
- SQL Server (`10.14.142.30\BTP`) and MinIO (`10.14.142.32:9000`) are external — NOT in docker-compose
- Only Redis in docker-compose for local dev
- IIS deployment via web.config + publish folder
- Dual deployment: Docker for staging/prod, IIS for legacy environments

## Requirements

### Functional
- Dockerfile with multi-stage build
- docker-compose.yml with API + MinIO + Redis
- IIS web.config for hosting
- Environment variable overrides for all config

### Non-Functional
- Docker image < 200MB
- Fast rebuild (layer caching for NuGet restore)
- Health check in Dockerfile

## Architecture

```
docker/
├── Dockerfile
├── docker-compose.yml
└── docker-compose.override.yml  (dev overrides)

src/FIS.FileManager.Api/
└── web.config                   (IIS hosting)
```

### Container Topology
```
┌────────────────────────────────┐
│ docker-compose                 │
│                                │
│  ┌─────────────┐    ┌──────┐  │
│  │ file-manager │    │redis │  │
│  │  :5000       │    │:6379 │  │
│  │  .NET 8 API  │    │      │  │
│  └──────┬───────┘    └──────┘  │
│         │                      │
└─────────┼──────────────────────┘
          │
   ┌──────┴──────────────────────┐
   │ TCP 1433        TCP 9000    │
   ▼                 ▼           │
   SQL Server        MinIO       │
   10.14.142.30\BTP  10.14.142.32│
   [FILE]            [btp bucket]│
   └─────────────────────────────┘
```

## Related Code Files

### Files to Create
- `docker/Dockerfile`
- `docker/docker-compose.yml`
- `docker/docker-compose.override.yml`
- `docker/.env`
- `src/FIS.FileManager.Api/web.config`

## Implementation Steps

### 1. Dockerfile

```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj files first (layer caching)
COPY src/FIS.FileManager.Api/FIS.FileManager.Api.csproj src/FIS.FileManager.Api/
COPY src/FIS.FileManager.Core/FIS.FileManager.Core.csproj src/FIS.FileManager.Core/
COPY src/FIS.FileManager.Infrastructure/FIS.FileManager.Infrastructure.csproj src/FIS.FileManager.Infrastructure/
COPY src/FIS.FileManager.Shared/FIS.FileManager.Shared.csproj src/FIS.FileManager.Shared/
COPY FIS.FileManager.sln .

RUN dotnet restore

# Copy all source and build
COPY src/ src/
RUN dotnet publish src/FIS.FileManager.Api/FIS.FileManager.Api.csproj \
    -c Release -o /app/publish --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Create temp upload directory
RUN mkdir -p /app/temp-uploads /app/logs

COPY --from=build /app/publish .

# <!-- Red Team: Dockerfile Health Check Fix — 2026-02-25 -->
# aspnet:8.0 image does NOT have curl — use wget instead
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "FIS.FileManager.Api.dll"]
```

### 2. docker-compose.yml

```yaml
version: '3.8'

services:
  file-manager:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "5000:8080"
    environment:
      - ConnectionStrings__SqlServer=Server=10.14.142.30\\BTP;Database=FILE;User Id=sa;Password=123456;TrustServerCertificate=True;
      - ConnectionStrings__Redis=redis:6379
      - MinIO__Endpoint=10.14.142.32:9000
      - MinIO__AccessKey=minioadmin
      - MinIO__SecretKey=minioadmin
      - MinIO__UseSSL=false
      - MinIO__Region=us-east-1
      - MinIO__DefaultBucket=btp
      - FileService__TempFileDirectory=/app/temp-uploads
    volumes:
      - temp-uploads:/app/temp-uploads
      - logs:/app/logs
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  redis-data:
  temp-uploads:
  logs:
```

### 3. docker-compose.override.yml (dev)

```yaml
version: '3.8'

services:
  file-manager:
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
    ports:
      - "5000:8080"
```

### 4. .env file

```env
# SQL Server (external)
SQL_SERVER=10.14.142.30\\BTP
SQL_DATABASE=FILE
SQL_USER=sa
SQL_PASSWORD=123456

# MinIO (external)
MINIO_ENDPOINT=10.14.142.32:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_REGION=us-east-1
MINIO_DEFAULT_BUCKET=btp

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

### 5. IIS web.config

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet"
                  arguments=".\FIS.FileManager.Api.dll"
                  stdoutLogEnabled="true"
                  stdoutLogFile=".\logs\stdout"
                  hostingModel="InProcess">
        <environmentVariables>
          <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Production" />
        </environmentVariables>
      </aspNetCore>
      <security>
        <requestFiltering>
          <!-- 100MB upload limit -->
          <requestLimits maxAllowedContentLength="104857600" />
        </requestFiltering>
      </security>
    </system.webServer>
  </location>
</configuration>
```

### 6. Build and Run Commands

```bash
# Docker
cd docker
docker compose up -d --build

# Verify
curl http://localhost:5000/health
curl http://localhost:5000/health/ready

# IIS publish
dotnet publish src/FIS.FileManager.Api -c Release -o ./publish
# Copy publish/ to IIS site folder
```

## Todo List
- [ ] Create Dockerfile (multi-stage build)
- [ ] Create docker-compose.yml (API + Redis; MinIO is external)
- [ ] Create docker-compose.override.yml (dev)
- [ ] Create .env file
- [ ] Create web.config for IIS
- [ ] Test `docker compose up -d --build`
- [ ] Verify health endpoints
- [ ] Test IIS publish + deploy

## Success Criteria
- `docker compose up` starts API + Redis (MinIO external at 10.14.142.32)
- API accessible at `http://localhost:5000`
- Health endpoints respond 200
- MinIO reachable at `10.14.142.32:9000` (external)
- IIS deployment works with web.config
- Docker image size < 200MB

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| SQL Server unreachable from Docker | Use host network or ensure firewall allows Docker subnet |
| MinIO data loss on `docker compose down` | Named volumes persist data |
| Large file uploads timeout in Docker | Kestrel timeout config, no reverse proxy timeout |

## Security Considerations
- DB credentials in docker-compose — use `.env` file (not committed to git)
- MinIO default credentials — change in production
- IIS `stdoutLogEnabled=true` — disable in production or secure log folder
- Add `.env` to `.gitignore`

## Next Steps
→ Phase 08: Testing (uses docker-compose for integration tests)
