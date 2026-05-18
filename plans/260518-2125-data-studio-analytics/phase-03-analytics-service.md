---
phase: 3
title: "Analytics Service — Spring Boot Orchestrator"
status: complete
effort: 10h
---

# Phase 3 — Analytics Service (Spring Boot)

## Context Links
- Plan: [plan.md](plan.md)
- Phase 1 (infra): [phase-01-infrastructure.md](phase-01-infrastructure.md)
- Phase 2 (executor): [phase-02-fastapi-executor.md](phase-02-fastapi-executor.md)
- Existing service pattern: `BE/order-service/` (follow same structure)
- Common module: `BE/common/`

## Overview
- **Priority**: P1 — gateway giữa FE và FastAPI executor
- **Status**: pending

Spring Boot microservice port **8087** làm orchestrator:
- Xác thực JWT / role ADMIN (via gateway headers)
- Rate limiting per user (Redis)
- Cache kết quả query (Redis, TTL 5 phút)
- Proxy call tới FastAPI executor
- Quản lý dataset catalog (PostgreSQL `analytics_metadata` schema)
- Lưu query history

## Requirements

**Functional:**
- `POST /execute` — nhận query, validate, call FastAPI, cache + trả kết quả
- `GET /datasets` — list available datasets (catalog từ DB + MinIO)
- `POST /datasets` — đăng ký dataset mới (sau khi upload lên MinIO)
- `GET /history` — lấy query history của user hiện tại (10 records gần nhất)
- `DELETE /history/{id}` — xóa 1 history record

**Non-functional:**
- Rate limit: 10 requests/phút/user (Redis sliding window)
- Cache hit: same query hash → return từ Redis, không call executor
- Timeout propagate tới FastAPI executor
- Chỉ ADMIN role được access mọi endpoints

## Architecture

```
BE/analytics-service/
├── src/main/java/com/ecommerce/analytics/
│   ├── AnalyticsServiceApplication.java
│   ├── config/
│   │   ├── AppConfig.java           # RestTemplate/WebClient bean
│   │   └── RedisConfig.java         # Cache + rate-limit config
│   ├── controller/
│   │   ├── ExecuteController.java   # POST /execute
│   │   ├── DatasetController.java   # GET/POST /datasets
│   │   └── HistoryController.java   # GET/DELETE /history
│   ├── service/
│   │   ├── ExecuteService.java      # core orchestration logic
│   │   ├── CacheService.java        # Redis cache helpers
│   │   ├── RateLimitService.java    # Redis rate limiter
│   │   └── DatasetService.java      # dataset catalog CRUD
│   ├── repository/
│   │   ├── QueryHistoryRepository.java
│   │   └── DatasetCatalogRepository.java
│   ├── domain/
│   │   ├── QueryHistory.java        # JPA entity
│   │   └── DatasetCatalog.java      # JPA entity
│   └── dto/
│       ├── ExecuteRequest.java
│       ├── ExecuteResponse.java
│       └── DatasetDTO.java
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/
│       └── V1__create_analytics_schema.sql
└── pom.xml
```

## Key Implementation Details

### pom.xml dependencies (thêm vào parent pom hoặc service pom)

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>
</dependencies>
```

### V1__create_analytics_schema.sql

```sql
CREATE SCHEMA IF NOT EXISTS analytics_metadata;

CREATE TABLE analytics_metadata.query_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    language    VARCHAR(10) NOT NULL CHECK (language IN ('sql','python','r')),
    code        TEXT NOT NULL,
    row_count   INTEGER,
    exec_ms     INTEGER,
    status      VARCHAR(10) NOT NULL DEFAULT 'success',
    error_msg   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qh_user_id ON analytics_metadata.query_history(user_id);
CREATE INDEX idx_qh_created_at ON analytics_metadata.query_history(created_at DESC);

CREATE TABLE analytics_metadata.dataset_catalog (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL UNIQUE,
    description  TEXT,
    minio_key    VARCHAR(500) NOT NULL,
    row_count    BIGINT,
    size_bytes   BIGINT,
    source_type  VARCHAR(20) NOT NULL DEFAULT 'upload',  -- 'upload' | 'export'
    schema_json  JSONB,                                  -- column names + types
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### dto/ExecuteRequest.java

```java
public record ExecuteRequest(
    @NotBlank String language,  // "sql" | "python" | "r"
    @NotBlank @Size(max = 50_000) String code,
    Integer timeout             // nullable — uses server default
) {}
```

### dto/ExecuteResponse.java

```java
public record ExecuteResponse(
    List<String> columns,
    List<List<Object>> rows,
    int rowCount,
    int executionMs,
    boolean truncated,
    String error        // null on success
) {}
```

### service/ExecuteService.java — core logic

```java
@Service
@RequiredArgsConstructor
public class ExecuteService {

    private final RestTemplate restTemplate;
    private final CacheService cacheService;
    private final RateLimitService rateLimitService;
    private final QueryHistoryRepository historyRepo;
    @Value("${analytics.executor.url}")
    private String executorUrl;

    public ExecuteResponse execute(String userId, ExecuteRequest req) {
        // 1. Rate limit check
        if (!rateLimitService.tryAcquire(userId)) {
            throw new TooManyRequestsException("Rate limit: 10 requests/minute");
        }

        // 2. Cache check (hash of language + code)
        String cacheKey = "analytics:result:" + DigestUtils.md5Hex(req.language() + req.code());
        ExecuteResponse cached = cacheService.get(cacheKey, ExecuteResponse.class);
        if (cached != null) return cached;

        // 3. Call FastAPI executor
        ExecuteResponse result;
        try {
            result = restTemplate.postForObject(
                executorUrl + "/execute",
                req,
                ExecuteResponse.class
            );
        } catch (HttpClientErrorException e) {
            result = new ExecuteResponse(List.of(), List.of(), 0, 0, false,
                e.getResponseBodyAsString());
        }

        // 4. Save to history
        saveHistory(UUID.fromString(userId), req, result);

        // 5. Cache if success
        if (result.error() == null) {
            cacheService.set(cacheKey, result, Duration.ofMinutes(5));
        }

        return result;
    }

    private void saveHistory(UUID userId, ExecuteRequest req, ExecuteResponse res) {
        var history = new QueryHistory();
        history.setUserId(userId);
        history.setLanguage(req.language());
        history.setCode(req.code());
        history.setRowCount(res.rowCount());
        history.setExecMs(res.executionMs());
        history.setStatus(res.error() == null ? "success" : "error");
        history.setErrorMsg(res.error());
        historyRepo.save(history);
    }
}
```

### service/RateLimitService.java

```java
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final StringRedisTemplate redis;
    private static final int MAX_PER_MINUTE = 10;

    public boolean tryAcquire(String userId) {
        String key = "analytics:ratelimit:" + userId;
        Long count = redis.opsForValue().increment(key);
        if (count == 1) {
            redis.expire(key, Duration.ofMinutes(1));
        }
        return count <= MAX_PER_MINUTE;
    }
}
```

### controller/ExecuteController.java

```java
@RestController
@RequestMapping
@RequiredArgsConstructor
public class ExecuteController {

    private final ExecuteService executeService;

    @PostMapping("/execute")
    public ResponseEntity<ExecuteResponse> execute(
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader("X-User-Role") String role,
            @Valid @RequestBody ExecuteRequest req) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(executeService.execute(userId, req));
    }
}
```

### application.yml

```yaml
server:
  port: 8087

spring:
  application:
    name: analytics-service
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/ecommerce}
    username: ${SPRING_DATASOURCE_USERNAME:postgres}
    password: ${SPRING_DATASOURCE_PASSWORD:postgres}
  flyway:
    enabled: true
    locations: classpath:db/migration
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}

analytics:
  executor:
    url: ${ANALYTICS_EXECUTOR_URL:http://localhost:8000}

management:
  endpoints:
    web:
      exposure:
        include: health,info
```

### GatewayConfig.java — thêm route

```java
// Trong BE/api-gateway/src/.../config/GatewayConfig.java
// Thêm vào RouteLocatorBuilder chain:
.route("analytics-service", r -> r
    .path("/analytics/**")
    .filters(f -> f
        .rewritePath("/analytics/(?<s>.*)", "/${s}")
        .filter(jwtFilter)
    )
    .uri("http://analytics-service:8087"))
```

## Todo List
- [ ] Tạo `BE/analytics-service/` module theo cấu trúc trên
- [ ] Tạo `pom.xml` cho analytics-service (copy từ order-service, adjust)
- [ ] Tạo Flyway migration `V1__create_analytics_schema.sql`
- [ ] Implement `QueryHistory.java` JPA entity
- [ ] Implement `DatasetCatalog.java` JPA entity
- [ ] Implement repositories
- [ ] Implement `ExecuteService.java` (rate-limit + cache + proxy)
- [ ] Implement `RateLimitService.java`
- [ ] Implement `CacheService.java`
- [ ] Implement `DatasetService.java`
- [ ] Implement controllers (Execute, Dataset, History)
- [ ] Implement `application.yml`
- [ ] Thêm route vào `GatewayConfig.java`
- [ ] Thêm `analytics-service` vào root `pom.xml` modules
- [ ] Test: POST `/analytics/execute` qua gateway với JWT ADMIN → kết quả
- [ ] Test: rate limit sau 10 requests → 429

## Success Criteria
- `POST /analytics/execute` với ADMIN JWT → DuckDB SQL result
- Cache: gọi lần 2 cùng query → Redis hit (response nhanh hơn)
- Rate limit: request 11 → 429 Too Many Requests
- History: `GET /analytics/history` → 10 queries gần nhất
- DB migration V1 chạy tự động khi start

## Risk Assessment
- **Analytics-service là module mới**: cần thêm vào parent `pom.xml` modules
- **Schema migration conflict**: dùng `analytics_metadata` schema riêng, không đụng schema hiện tại
- **RestTemplate timeout**: set connect/read timeout để tránh treo khi executor chậm

## Security
- Mọi endpoints check `X-User-Role: ADMIN` (inject bởi gateway sau JWT verify)
- Cache key hash MD5 — không lưu code plain trong Redis key
- Query history lưu `user_id` — mỗi admin chỉ thấy history của mình
