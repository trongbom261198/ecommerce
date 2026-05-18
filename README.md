# E-Commerce + Logistics Platform

A comprehensive Vietnamese market e-commerce and logistics system with microservices backend (Java Spring Boot 3.x) and modern frontend (React 18 + TypeScript).

## Quick Start

### Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose)
- Java 17+ (for local development)
- Node.js 18+ (for frontend development)
- PostgreSQL 16 (included in docker-compose)

### Setup (Docker)

```bash
# Clone repository
git clone <repo-url>
cd project

# Start all services (PostgreSQL, Redis, Kafka, Elasticsearch, MinIO, backend, frontend)
docker-compose up -d

# Services are ready after ~60 seconds
# Check health: http://localhost:8080/actuator/health
```

### Services Overview

| Service | Port | Purpose |
|---------|------|---------|
| **API Gateway** | 8080 | Routes requests to microservices, JWT validation, CORS |
| **user-service** | 8081 | Authentication, user profiles, addresses |
| **product-service** | 8082 | Products, categories, search, reviews |
| **order-service** | 8083 | Orders, cart, checkout, flash sales, payments, chat |
| **inventory-service** | 8084 | Stock management, warehouse allocation |
| **fulfillment-service** | 8085 | Picking, packing, task tracking |
| **delivery-service** | 8086 | Shipments, tracking, carrier integration |
| **Frontend** | 5173 (dev), 3000 (prod) | React 18 + TypeScript UI |

### Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Primary database (ecommerce) |
| Redis | 6379 | Caching, sessions, distributed locks |
| Kafka | 9092 | Event streaming (9 topics) |
| Elasticsearch | 9200 | Product search + autocomplete |
| MinIO | 9000/9001 | S3-compatible image storage |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Monitoring dashboards |
| Zookeeper | 2181 | Kafka coordination |

## Technology Stack

### Backend
- **Java 17+** — runtime
- **Spring Boot 3.x** — framework
- **Spring Cloud Gateway** — API gateway
- **Spring Security + JWT** — authentication
- **Spring Data JPA** — ORM
- **Kafka** — event streaming
- **PostgreSQL 16** — database
- **Redis 7** — caching, sessions
- **Elasticsearch 8.13** — search indexing
- **MinIO** — image storage
- **SpringDoc OpenAPI 2.5.0** — API documentation

### Frontend
- **React 18.3.1** — UI framework
- **TypeScript 5.5.3** — type safety
- **Vite 6.4.2** — build tool
- **Ant Design 6.3.7** — component library
- **Tailwind CSS 3.4.11** — styling
- **Zustand 4.5.5** — state management
- **TanStack React Query 5.56.2** — server state
- **Axios 1.7.7** — HTTP client

## Project Structure

```
project/
├── backend/
│   ├── api-gateway/                      # Port 8080
│   ├── user-service/                     # Port 8081
│   ├── product-service/                  # Port 8082
│   ├── order-service/                    # Port 8083
│   ├── inventory-service/                # Port 8084
│   ├── fulfillment-service/              # Port 8085
│   ├── delivery-service/                 # Port 8086
│   └── common/                           # Shared DTOs, Kafka events, exceptions
├── frontend/
│   ├── src/
│   │   ├── pages/                        # Route pages
│   │   ├── components/                   # Reusable components
│   │   ├── hooks/                        # Custom hooks
│   │   ├── store/                        # Zustand stores
│   │   ├── api/                          # Axios instance, API functions
│   │   └── types/                        # TypeScript interfaces
│   ├── vite.config.ts
│   └── package.json
├── docs/                                 # Documentation
├── docker-compose.yml
└── README.md
```

## Key Features

### Authentication & Authorization
- JWT token-based auth (15min access, 7day refresh)
- OAuth2 Google integration
- Role-based access (CUSTOMER, ADMIN, STAFF, DRIVER)
- Email verification + OTP forgot-password

### Product Management
- Product catalog with SKU variants
- Elasticsearch-powered search + autocomplete
- Category hierarchy
- Product reviews (1-5 stars)
- Flash sales with time-based promotions

### Order Management
- Shopping cart (Redis-backed, 7-day TTL)
- Checkout with address selection
- Order state machine (PENDING → DELIVERED)
- VNPay payment gateway integration
- Payment confirmation & webhooks

### Inventory & Fulfillment
- Multi-warehouse stock management
- Distributed locks (Redis) for reservations
- Fulfillment task assignment
- Order picking + packing workflow

### Delivery & Logistics
- Shipment tracking integration
- GHN + GHTK carrier APIs
- Real-time order tracking
- SLA monitoring

### Communication
- Order notifications (email + SMS)
- Real-time chat (WebSocket STOMP)
- Bot + admin chat support
- Flash sale announcements

## API Documentation

Generated Swagger docs available at: `http://localhost:8080/swagger-ui.html`

### Example: User Registration

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "fullName": "John Doe",
    "phone": "+84912345678"
  }'
```

### Example: Create Order

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cartItems": [...],
    "shippingAddressId": "address-uuid",
    "paymentMethod": "VNPAY"
  }'
```

## Development

### Backend

```bash
# Build all services
mvn clean package

# Run individual service
cd backend/user-service
mvn spring-boot:run

# Run tests
mvn test

# Check for compile errors
mvn compile
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server (http://localhost:5173)
npm run dev

# Build production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

## Testing

### Backend
```bash
# Unit + integration tests
mvn test

# With coverage
mvn clean test jacoco:report
```

### Frontend
```bash
cd frontend

# Unit tests (Vitest)
npm run test

# E2E tests (Playwright/Cypress)
npm run test:e2e
```

## Monitoring

### Health Checks
```bash
# API Gateway
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/health/liveness
curl http://localhost:8080/actuator/health/readiness

# Individual services
curl http://localhost:8081/actuator/health  # user-service
```

### Metrics & Dashboards
- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3000 (admin:admin)
- **Elasticsearch:** http://localhost:9200
- **MinIO Console:** http://localhost:9001

## Database Migrations

Flyway manages schema migrations automatically on service startup. Migrations live in `src/main/resources/db/migration/`.

**Current migration versions:** V1-V19 (varies per service)

## Kafka Event Topics

| Topic | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| order.created | order | inventory, fulfillment | New order notification |
| order.status_changed | order | * | Order state updates |
| inventory.reserved | inventory | order | Stock reservation confirmed |
| inventory.reserve_failed | inventory | order | Stock not available |
| fulfillment.packed | fulfillment | delivery | Packing completed |
| shipment.status_changed | delivery | order | Delivery status update |
| order.delivered | delivery | product | Triggers review eligibility |
| order.review_eligible | product | * | User can now review product |

## Environment Variables

Copy `.env.example` to `.env` and configure per service:

```bash
# Database
DB_URL=jdbc:postgresql://postgres:5432/ecommerce
DB_USERNAME=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9092

# Elasticsearch
ELASTICSEARCH_HOST=elasticsearch
ELASTICSEARCH_PORT=9200

# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION_MS=900000  # 15 minutes

# OAuth2 (Google)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret

# Payment (VNPay)
VNPAY_TMNT_CODE=your-merchant-code
VNPAY_HASH_SECRET=your-hash-secret
VNPAY_API_URL=https://sandbox.vnpayment.vn  # sandbox or production

# Carriers
GHN_API_KEY=your-ghn-key
GHN_SHOP_ID=your-shop-id
GHTK_API_KEY=your-ghtk-key
```

## Troubleshooting

### Services won't start
```bash
# Check docker logs
docker-compose logs <service-name>

# Rebuild images
docker-compose down
docker-compose up --build
```

### Database connection errors
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Re-initialize
docker-compose down -v
docker-compose up
```

### Port conflicts
If ports are in use, update `docker-compose.yml` port mappings.

## Documentation Files

- **[Project Overview & PDR](./docs/project-overview-pdr.md)** — Business goals, requirements, success metrics
- **[Codebase Summary](./docs/codebase-summary.md)** — Architecture, services, file structure
- **[Code Standards](./docs/code-standards.md)** — Naming, patterns, testing conventions
- **[System Architecture](./docs/system-architecture.md)** — Data flow, component interactions, deployment
- **[Project Roadmap](./docs/project-roadmap.md)** — Phases, milestones, progress
- **[Deployment Guide](./docs/deployment-guide.md)** — Local setup, environment config, production deployment

## Contributing

1. Read [Code Standards](./docs/code-standards.md) for development guidelines
2. Create feature branch: `git checkout -b feature/my-feature`
3. Follow commit conventions (conventional commits)
4. Run tests: `mvn test` (backend), `npm test` (frontend)
5. Submit pull request with clear description

## License

Proprietary — Internal Use Only

## Support

- **Issues:** GitHub Issues (or internal tracking system)
- **Questions:** Team chat or documentation
- **Deployment:** DevOps team
