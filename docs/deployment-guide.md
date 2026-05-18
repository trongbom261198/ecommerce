# E-Commerce + Logistics Platform — Deployment Guide

## Quick Start (Local Development)

### Prerequisites
- **Docker Desktop** (v20.10+) with Docker Compose
- **Git** (for cloning repository)
- **Terminal/Shell** (bash, zsh, or PowerShell)
- **Text editor** (VS Code recommended)

### Setup (5 minutes)

```bash
# Clone repository
git clone <repository-url>
cd project

# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d

# Wait for services to be ready (~60 seconds)
# Check health
curl http://localhost:8080/actuator/health

# Access applications
# API: http://localhost:8080 (Swagger: /swagger-ui.html)
# Frontend: http://localhost:5173
# Grafana: http://localhost:3000 (admin:admin)
# MinIO: http://localhost:9001 (minioadmin:minioadmin)
```

### First Steps
1. **Register user** → POST `/api/v1/auth/register` or sign up via frontend
2. **Browse products** → GET `/api/v1/products?q=<search>`
3. **Add to cart** → POST `/api/v1/cart/items`
4. **Create order** → POST `/api/v1/orders`
5. **View admin dashboard** → Navigate to `/admin` (requires ADMIN role)

### Verify All Services Are Running

```bash
# Check service status
docker-compose ps

# Expected output:
# NAME                COMMAND                  SERVICE             STATUS              PORTS
# postgres           docker-entrypoint.s...   postgres            Up 2 minutes        5432/tcp
# redis              redis-server             redis               Up 2 minutes        6379/tcp
# kafka              /opt/kafka/bin/kafka...  kafka               Up 2 minutes        9092/tcp
# zookeeper          /opt/zookeeper/bin/...  zookeeper           Up 2 minutes        2181/tcp
# elasticsearch      /bin/tini -- /usr/...  elasticsearch       Up 2 minutes        9200/tcp
# minio              /usr/bin/minio server   minio               Up 2 minutes        9000/tcp, 9001/tcp
# api-gateway        java -jar app.jar       api-gateway         Up 2 minutes        8080/tcp
# user-service       java -jar app.jar       user-service        Up 2 minutes        8081/tcp
# product-service    java -jar app.jar       product-service     Up 2 minutes        8082/tcp
# order-service      java -jar app.jar       order-service       Up 2 minutes        8083/tcp
# inventory-service  java -jar app.jar       inventory-service   Up 2 minutes        8084/tcp
# fulfillment-service java -jar app.jar      fulfillment-service Up 2 minutes        8085/tcp
# delivery-service   java -jar app.jar       delivery-service    Up 2 minutes        8086/tcp
# frontend           npm run dev              frontend            Up 2 minutes        5173/tcp
```

### Check Service Logs

```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f order-service

# View last 100 lines
docker-compose logs --tail=100 user-service
```

---

## Environment Configuration

### .env File Template

```bash
# Database
DB_URL=jdbc:postgresql://postgres:5432/ecommerce
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_POOL_SIZE=20
DB_MAX_LIFETIME_MS=600000

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9092

# Elasticsearch
ELASTICSEARCH_HOST=elasticsearch
ELASTICSEARCH_PORT=9200

# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRY_MS=900000      # 15 minutes
JWT_REFRESH_TOKEN_EXPIRY_MS=604800000  # 7 days

# OAuth2 (Google)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# VNPay (Sandbox)
VNPAY_API_URL=https://sandbox.vnpayment.vn
VNPAY_TMNT_CODE=your-merchant-code
VNPAY_HASH_SECRET=your-hash-secret
VNPAY_RETURN_URL=http://localhost:5173/payment-result

# Carriers
GHN_API_KEY=your-ghn-api-key
GHN_SHOP_ID=your-shop-id
GHTK_API_KEY=your-ghtk-api-key

# Email (optional, for production)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@example.com

# Logging
LOG_LEVEL=INFO
LOG_FILE_PATH=/var/log/ecommerce

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Feature Flags
ENABLE_CHAT_BOT=true
ENABLE_FLASH_SALES=true
ENABLE_ADMIN_DASHBOARD=true

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ADMIN_PASSWORD=admin
```

### Per-Service Environment Variables

Each service can override defaults in `docker-compose.override.yml`:

```yaml
services:
  order-service:
    environment:
      SPRING_APPLICATION_NAME: order-service
      SERVER_PORT: 8083
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ecommerce
      SPRING_DATA_REDIS_HOST: redis
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092
      # Service-specific settings
      ORDER_PAYMENT_TIMEOUT_SECONDS: 300
      ORDER_SLA_HOURS: 24
```

---

## Docker Compose Configuration

### Starting Services

```bash
# Start all services in background
docker-compose up -d

# Start with logs
docker-compose up

# Start specific service
docker-compose up -d order-service

# Rebuild images and start
docker-compose up -d --build

# Start with specific profile (dev, staging, prod)
docker-compose --profile dev up -d
```

### Stopping Services

```bash
# Stop all services (data persists)
docker-compose stop

# Stop and remove containers (data persists in volumes)
docker-compose down

# Stop, remove containers, and delete volumes (data DELETED)
docker-compose down -v

# Stop specific service
docker-compose stop order-service
```

### Scaling Services

```bash
# Run 3 instances of order-service
docker-compose up -d --scale order-service=3

# Note: Only stateless services can be scaled
# Do NOT scale: postgres, redis, kafka, elasticsearch, minio
```

---

## Health Checks & Verification

### API Gateway Health

```bash
# Liveness probe (simple availability)
curl http://localhost:8080/actuator/health

# Response: {"status":"UP"}

# Readiness probe (dependencies available)
curl http://localhost:8080/actuator/health/readiness

# Response: {"status":"UP","components":{"db":{"status":"UP"},...}}
```

### Service-Specific Health

```bash
# user-service
curl http://localhost:8081/actuator/health

# product-service
curl http://localhost:8082/actuator/health

# order-service
curl http://localhost:8083/actuator/health

# inventory-service
curl http://localhost:8084/actuator/health

# fulfillment-service
curl http://localhost:8085/actuator/health

# delivery-service
curl http://localhost:8086/actuator/health
```

### Database Connection

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d ecommerce

# List tables
\dt

# Check migrations applied
SELECT * FROM flyway_schema_history;

# Exit psql
\q
```

### Redis Connection

```bash
# Test Redis
docker-compose exec redis redis-cli PING

# Response: PONG

# View all keys
docker-compose exec redis redis-cli KEYS "*"

# Check cart data
docker-compose exec redis redis-cli GET "cart:user-123"
```

### Kafka Topics

```bash
# List all topics
docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Describe topic
docker-compose exec kafka kafka-topics \
  --describe \
  --topic order.created \
  --bootstrap-server localhost:9092

# Consume messages (last 10)
docker-compose exec kafka kafka-console-consumer \
  --topic order.created \
  --from-beginning \
  --max-messages 10 \
  --bootstrap-server localhost:9092
```

### Elasticsearch Indices

```bash
# List indices
curl -X GET http://localhost:9200/_cat/indices

# Check ProductDocument mapping
curl -X GET http://localhost:9200/product_document/_mapping

# Search products
curl -X GET http://localhost:9200/product_document/_search \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}}'
```

---

## Development Workflow

### Making Code Changes

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes to backend or frontend

# 3. Rebuild affected service(s)
# For Java: mvn clean package
# For React: npm run build

# 4. Rebuild Docker image
docker-compose build order-service

# 5. Restart service
docker-compose up -d order-service

# 6. View logs
docker-compose logs -f order-service

# 7. Test changes
curl http://localhost:8080/api/v1/orders

# 8. Commit and push
git add .
git commit -m "feat: add new feature"
git push origin feature/my-feature
```

### Running Tests Locally

```bash
# Backend tests (JUnit)
cd backend/order-service
mvn clean test

# All backend tests
cd backend
mvn clean test

# Frontend tests (Vitest)
cd frontend
npm test

# E2E tests (Playwright)
npm run test:e2e

# Run with coverage
npm run test:coverage
```

### Debugging a Service

```bash
# View service logs
docker-compose logs -f order-service

# View last 100 lines
docker-compose logs --tail=100 order-service

# Connect to running container
docker-compose exec order-service /bin/bash

# View environment variables
docker-compose exec order-service env

# Check Java process
docker-compose exec order-service jps -l
```

---

## Production Deployment

### Prerequisites
- **Kubernetes cluster** (1.24+) with 3+ worker nodes
- **Helm** (3.x) for package management
- **kubectl** configured to access cluster
- **Container registry** (ECR, GCR, Docker Hub) for images
- **PostgreSQL managed service** (RDS, CloudSQL, Azure Database)
- **Redis managed service** (ElastiCache, MemoryStore, Azure Cache)
- **Kafka managed service** (MSK, Confluent Cloud) or self-hosted
- **Domain name** with SSL certificate

### Kubernetes Deployment

**Create Kubernetes manifests (helm charts preferred):**

```yaml
# values.yaml
replicaCount: 3

image:
  registry: docker.io
  name: your-registry/ecommerce-api-gateway
  tag: 1.0.0
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix

env:
  SPRING_DATASOURCE_URL: jdbc:postgresql://postgres.example.com:5432/ecommerce
  SPRING_DATA_REDIS_HOST: redis.example.com
  SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka.example.com:9092
  JWT_SECRET: ${SECRET_JWT_SECRET}  # From Kubernetes Secret

resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

**Deploy with Helm:**

```bash
# Create namespace
kubectl create namespace ecommerce-prod

# Create secrets
kubectl create secret generic db-credentials \
  --from-literal=password='your-db-password' \
  -n ecommerce-prod

kubectl create secret generic jwt-secret \
  --from-literal=jwt-secret='your-jwt-secret' \
  -n ecommerce-prod

# Deploy
helm install ecommerce ./helm/ecommerce \
  -f helm/values-prod.yaml \
  --namespace ecommerce-prod

# Verify deployment
kubectl get pods -n ecommerce-prod
kubectl get svc -n ecommerce-prod
```

### Infrastructure Setup

**PostgreSQL (AWS RDS example):**
```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier ecommerce-prod \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 16.1 \
  --master-username postgres \
  --master-user-password 'YourSecurePassword123!' \
  --allocated-storage 100 \
  --storage-type gp3 \
  --backup-retention-period 30 \
  --multi-az
```

**Redis (AWS ElastiCache example):**
```bash
# Create Redis cluster
aws elasticache create-replication-group \
  --replication-group-description "ecommerce-prod" \
  --engine redis \
  --cache-node-type cache.t3.medium \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --at-rest-encryption-enabled
```

**Kafka (Self-hosted or managed service like MSK)**
```bash
# Ensure 3+ brokers, replication factor 3
# Topics created with partitions = broker count
kafka-topics --create \
  --topic order.created \
  --partitions 3 \
  --replication-factor 3 \
  --bootstrap-server kafka:9092
```

### Domain & SSL

```bash
# Point your domain to load balancer IP
# Example: api.example.com → 203.0.113.42

# Use cert-manager for automatic SSL renewal
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
cat > cert-issuer.yaml <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

kubectl apply -f cert-issuer.yaml
```

### Monitoring Setup

```bash
# Install Prometheus
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/prometheus \
  -n monitoring \
  --create-namespace

# Install Grafana
helm repo add grafana https://grafana.github.io/helm-charts
helm install grafana grafana/grafana \
  -n monitoring \
  --set adminPassword='YourSecurePassword123!'

# Access Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80
# Visit http://localhost:3000 (admin:YourSecurePassword123!)
```

### Backup & Disaster Recovery

```bash
# PostgreSQL backups (automated daily via RDS)
aws rds create-db-snapshot \
  --db-instance-identifier ecommerce-prod \
  --db-snapshot-identifier ecommerce-backup-2026-05-12

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier ecommerce-prod-restored \
  --db-snapshot-identifier ecommerce-backup-2026-05-12

# Redis snapshot (automatic with ElastiCache)
# Manual backup available via AWS console

# Kafka backups (configure log retention + external backup)
# Recommended: Use managed Kafka service with built-in backups
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs order-service

# Common issues:
# 1. Port already in use
#    → Modify docker-compose.yml port mappings
# 2. Database not ready
#    → Wait 30s then retry: docker-compose restart order-service
# 3. OutOfMemory
#    → Increase Docker memory: Preferences → Resources → Memory
```

### Database Connection Errors

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check connection string in .env
# Default: jdbc:postgresql://postgres:5432/ecommerce

# Test connection
docker-compose exec postgres psql -U postgres -c "SELECT 1"

# Check firewall (if using external DB)
telnet postgres-host 5432
```

### API Gateway Not Routing Requests

```bash
# Check gateway logs
docker-compose logs api-gateway

# Verify service discovery
curl -X GET http://localhost:8080/actuator/gateway/routes

# Test direct service call
curl http://localhost:8081/actuator/health  # user-service

# Check CORS headers
curl -X OPTIONS http://localhost:8080/api/v1/products \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
```

### High Latency or Timeouts

```bash
# Check database query performance
docker-compose exec postgres psql -U postgres -d ecommerce \
  -c "SELECT * FROM pg_stat_statements WHERE mean_time > 100 ORDER BY mean_time DESC LIMIT 10;"

# Check Redis slowlog
docker-compose exec redis redis-cli SLOWLOG GET 10

# Monitor service metrics
curl http://localhost:9090/api/v1/query?query=http_request_duration_seconds

# Check Kafka consumer lag
kafka-consumer-groups --describe --group order-service --bootstrap-server kafka:9092
```

### Out of Disk Space

```bash
# Check Docker volume usage
docker system df

# Clean up unused volumes
docker volume prune

# Manually remove specific volume
docker volume rm ecommerce_postgres_data

# Note: This will DELETE your data; make sure you have backups!
```

---

## Performance Tuning

### Database Connection Pool

```properties
# In application.yml or .env
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

### JVM Tuning

```bash
# In docker-compose.yml
environment:
  JAVA_OPTS: >
    -Xms512m
    -Xmx1g
    -XX:+UseG1GC
    -XX:MaxGCPauseMillis=200
    -XX:+UnlockDiagnosticVMOptions
    -XX:G1SummarizeRSetStatsPeriod=1
```

### Kafka Consumer Configuration

```properties
# In application.yml
spring.kafka.consumer.max-poll-records=500
spring.kafka.consumer.fetch-min-bytes=1024
spring.kafka.consumer.fetch-max-wait-ms=500
```

### Elasticsearch Query Optimization

```json
// Add explicit query analyzer
PUT /product_document
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "autocomplete": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "edge_ngram"]
        }
      }
    }
  }
}
```

---

## Monitoring Commands

```bash
# Check all pod status
kubectl get pods -n ecommerce-prod

# View service endpoints
kubectl get svc -n ecommerce-prod

# Check persistent volume status
kubectl get pvc -n ecommerce-prod

# View logs from pod
kubectl logs -f deployment/order-service -n ecommerce-prod

# Execute command in pod
kubectl exec -it deployment/order-service -n ecommerce-prod -- /bin/bash

# Port forward for local testing
kubectl port-forward -n ecommerce-prod svc/api-gateway 8080:8080

# Check resource utilization
kubectl top nodes
kubectl top pods -n ecommerce-prod

# View recent events
kubectl get events -n ecommerce-prod --sort-by='.lastTimestamp'
```

---

## Rollback Procedures

```bash
# Rollback Kubernetes deployment
kubectl rollout undo deployment/order-service -n ecommerce-prod

# Rollback specific revision
kubectl rollout undo deployment/order-service --to-revision=2 -n ecommerce-prod

# Check rollout history
kubectl rollout history deployment/order-service -n ecommerce-prod

# Pause rollout (canary deployment)
kubectl rollout pause deployment/order-service -n ecommerce-prod

# Resume rollout
kubectl rollout resume deployment/order-service -n ecommerce-prod
```

---

## Support & Escalation

**Deployment Issues?** Check these in order:
1. Service logs: `docker-compose logs <service>`
2. Health endpoints: `curl http://localhost:8080/actuator/health`
3. Database: `docker-compose exec postgres psql -U postgres -d ecommerce`
4. Redis: `docker-compose exec redis redis-cli PING`
5. Kafka: `docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092`

**Still stuck?** Open an issue with:
- Error message (full stack trace)
- Steps to reproduce
- Environment (local, staging, production)
- Docker version: `docker --version`
- Docker Compose version: `docker-compose --version`

---

**Document Version:** 1.0
**Last Updated:** 2026-05-12
**Next Review:** When infrastructure changes occur
