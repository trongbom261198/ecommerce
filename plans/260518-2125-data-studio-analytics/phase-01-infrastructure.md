---
phase: 1
title: "Infrastructure — Docker Services + MinIO Bucket"
status: complete
effort: 4h
---

# Phase 1 — Infrastructure

## Context Links
- Plan: [plan.md](plan.md)
- docker-compose: `BE/docker-compose.yml`
- MinIO hiện tại đã chạy trên port 9000/9001

## Overview
- **Priority**: P0 — Các phase sau đều cần
- **Status**: pending

Thêm 2 services mới vào docker-compose:
1. `analytics-executor` — FastAPI Python service (chạy DuckDB + sandbox)
2. Cấu hình MinIO bucket `analytics-data` + K8S namespace (optional prod)

## Requirements

**Functional:**
- `analytics-executor` container build được từ `BE/analytics-executor/Dockerfile`
- MinIO bucket `analytics-data` tự động tạo khi startup
- analytics-executor chỉ accessible nội bộ (không expose ra ngoài)
- analytics-executor có thể đọc MinIO qua biến môi trường S3

**Non-functional:**
- Restart policy: `unless-stopped`
- Resource limits: analytics-executor max 2 CPU, 2GB RAM (sandbox safety)
- Health check trên `/health` endpoint FastAPI

## Architecture

```
docker-compose network: ecommerce-network (existing)
    ├── analytics-executor:8000  (new — internal only)
    └── analytics-service:8087   (new — exposed via gateway)

MinIO buckets:
    ├── product-images/   (existing)
    └── analytics-data/   (new)
        ├── exports/orders.parquet
        ├── exports/products.parquet
        ├── exports/users.parquet
        └── uploads/      (manual uploads)
```

## Files to Create/Modify

**Modify:**
- `BE/docker-compose.yml` — thêm analytics-executor service, minio-init bucket

**Create:**
- `BE/analytics-executor/Dockerfile`
- `BE/analytics-executor/requirements.txt`
- `BE/analytics-executor/.dockerignore`

## Implementation Steps

### 1. Tạo Dockerfile cho analytics-executor

```dockerfile
# BE/analytics-executor/Dockerfile
FROM python:3.12-slim

# Install R for R language support
RUN apt-get update && apt-get install -y \
    r-base \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install R packages
RUN Rscript -e "install.packages(c('jsonlite', 'dplyr', 'ggplot2'), repos='https://cran.r-project.org')"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. requirements.txt

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
duckdb==1.1.3
pandas==2.2.3
numpy==2.1.2
pyarrow==17.0.0
boto3==1.35.40
s3fs==2024.9.0
httpx==0.27.2
pydantic==2.9.2
psutil==6.0.0
resource-limiter==0.1.0
```

### 3. Thêm vào docker-compose.yml

```yaml
  analytics-executor:
    build:
      context: ./analytics-executor
      dockerfile: Dockerfile
    container_name: ecommerce-analytics-executor
    environment:
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      ANALYTICS_BUCKET: analytics-data
      PYTHON_EXEC_TIMEOUT_SEC: 30
      MAX_RESULT_ROWS: 10000
    networks:
      - ecommerce-network
    # NOT exposed externally — only analytics-service can call
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    depends_on:
      minio:
        condition: service_healthy

  analytics-service:
    build:
      context: ./analytics-service
      dockerfile: Dockerfile
    container_name: ecommerce-analytics-service
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ecommerce
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
      REDIS_HOST: redis
      REDIS_PORT: 6379
      ANALYTICS_EXECUTOR_URL: http://analytics-executor:8000
      JWT_SECRET: ${JWT_SECRET:-your-secret-key}
    ports:
      - "8087:8087"
    networks:
      - ecommerce-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      analytics-executor:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8087/actuator/health"]
      interval: 15s
      timeout: 5s
      retries: 10
    restart: unless-stopped
```

### 4. MinIO bucket init (thêm vào minio-init hoặc tạo mới)

Nếu có `minio-init` service trong docker-compose, thêm lệnh:
```bash
mc mb minio/analytics-data --ignore-existing
mc policy set private minio/analytics-data
```

Nếu chưa có, tạo service `minio-init`:
```yaml
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: ["/bin/sh", "-c"]
    command: |
      "
      mc alias set local http://minio:9000 minioadmin minioadmin
      mc mb local/analytics-data --ignore-existing
      mc policy set private local/analytics-data
      echo 'MinIO analytics bucket ready.'
      "
    networks:
      - ecommerce-network
    restart: on-failure
```

### 5. API Gateway route (GatewayConfig.java)

```java
// Thêm route cho analytics-service
.route("analytics-service", r -> r
    .path("/analytics/**")
    .filters(f -> f.rewritePath("/analytics/(?<segment>.*)", "/${segment}"))
    .uri("lb://analytics-service"))
```

Nếu gateway không dùng load balancer (lb://), dùng:
```java
.uri("http://analytics-service:8087")
```

## Todo List
- [ ] Tạo `BE/analytics-executor/Dockerfile`
- [ ] Tạo `BE/analytics-executor/requirements.txt`
- [ ] Tạo `BE/analytics-executor/.dockerignore`
- [ ] Thêm `analytics-executor` service vào `BE/docker-compose.yml`
- [ ] Thêm `analytics-service` service vào `BE/docker-compose.yml`
- [ ] Tạo/update MinIO init cho bucket `analytics-data`
- [ ] Thêm route `/analytics/**` vào `GatewayConfig.java`
- [ ] Test: `docker-compose up analytics-executor` → health check passes

## Success Criteria
- `docker-compose up analytics-executor` chạy thành công
- `curl http://localhost:8000/health` → `{"status":"ok"}`
- MinIO có bucket `analytics-data`
- API Gateway route `/analytics/**` → `analytics-service:8087`

## Risk Assessment
- **R build time chậm** (apt-get + R packages): cache Docker layer, Dockerfile tối ưu
- **Memory limit**: Python sandbox cần giám sát OOM kill
- **MinIO init race condition**: depends_on với healthcheck giải quyết

## Security Considerations
- `analytics-executor` KHÔNG expose port ra host — chỉ nội bộ Docker network
- MinIO bucket `analytics-data` set policy `private`
- Resource limits tránh DoS từ query nặng

## Next Steps
- Phase 2: Xây dựng FastAPI analytics-executor logic
