# Research Report: VNPay, Email & Elasticsearch Integration for Spring Boot 3.3

**Date:** 2026-05-10 | **Status:** Complete

---

## 1. VNPay Payment Gateway Integration

### Sandbox Credentials & URLs
- **Registration:** Contact VNPay → receive vnp_TmnCode (merchant code) + vnp_HashSecret (secret key) via email
- **Sandbox URLs:**
  - Payment: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
  - API Query/Refund: `https://sandbox.vnpayment.vn/merchant_webapi/merchant.html`
- **Test Card:** Bank NCB, Card: 9704198526191432198, Name: NGUYEN VAN A, Issue: 07/15, OTP: 123456

### Required Parameters (No SDK)
VNPay provides no official Java SDK. Implement direct HTTP requests:

**Payment Request Parameters:**
- `vnp_TmnCode`: Merchant code (string)
- `vnp_Amount`: Amount in VND (integer × 100, e.g., 100000 VND = 10000000)
- `vnp_TxnRef`: Unique transaction reference (merchant-generated)
- `vnp_Command`: "pay" (string)
- `vnp_Locale`: "vn" or "en"
- `vnp_OrderInfo`: Order description
- `vnp_ReturnUrl`: Callback URL after payment (user redirected here)
- `vnp_CurrCode`: "VND"
- `vnp_Version`: "2.1.0"
- `vnp_OrderType`: "billpayment"
- `vnp_CreateDate`: YYYYMMDDHHmmss
- `vnp_IpAddr`: Client IP address
- `vnp_SecureHash`: HMAC-SHA512 signature

### HMAC-SHA512 Signature Generation
**Critical for security validation:**

```java
// 1. Sort parameters alphabetically by key (excluding vnp_SecureHash)
// 2. Build hashData string: "param1=value1&param2=value2..."
// 3. Generate signature:
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

String vnp_HashSecret = "..."; // from VNPay
String hashData = "..."; // sorted params

Mac mac = Mac.getInstance("HmacSHA512");
SecretKeySpec keySpec = new SecretKeySpec(vnp_HashSecret.getBytes(), "HmacSHA512");
mac.init(keySpec);
byte[] bytes = mac.doFinal(hashData.getBytes());
String vnp_SecureHash = hex(bytes).toUpperCase(); // hex encoding, NOT base64
```

**Key gotcha:** VNPay expects **hex-encoded** (uppercase), not Base64.

### IPN Webhook Handling
- VNPay POSTs to your `Return URL` with payment status
- **Idempotency required:** Same IPN may arrive multiple times; check if transaction processed before updating
- **Validate signature:** Recalculate HMAC-SHA512 of received params, compare with `vnp_SecureHash`
- **Response:** Echo `vnp_ResponseCode` (00 = success, others = failure)
- **Security:** Validate IPN IP whitelist if needed (contact VNPay for IP range)

### Payment Flow
1. User clicks "Pay with VNPay"
2. Backend generates payment URL with all params + signature
3. Redirect user to sandbox URL with query string
4. User enters bank details in VNPay UI
5. VNPay redirects to your returnUrl with payment status
6. VNPay calls IPN webhook asynchronously with status update
7. Backend confirms payment in DB after successful IPN

---

## 2. Spring Boot Email (Gmail SMTP + Notifications)

### Dependencies & Configuration
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-mail</artifactId>
</dependency>
```

**application.properties (or application.yml):**
```properties
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.username=your-email@gmail.com
spring.mail.password=YOUR_GOOGLE_APP_PASSWORD  # NOT Gmail password
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
spring.mail.properties.mail.smtp.starttls.required=true
spring.mail.properties.mail.smtp.connectiontimeout=5000
spring.mail.properties.mail.smtp.timeout=5000
spring.mail.properties.mail.smtp.writetimeout=5000
```

**Gmail Setup:**
- Enable 2-step verification in Google Account
- Generate App Password (not account password) at [myaccount.google.com/app-passwords](https://myaccount.google.com/app-passwords)
- Use app password in config

### Implementation Pattern
```java
@Service
public class EmailService {
    @Autowired private JavaMailSender mailSender;
    
    public void sendResetLink(String email, String resetToken) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setTo(email);
        msg.setSubject("Password Reset");
        msg.setText("Click link: http://yourdomain.com/reset?token=" + resetToken);
        mailSender.send(msg);
    }
}
```

For **HTML emails**, use `MimeMessagePreparator` with `MimeMessageHelper`.

---

## 3. Forgot Password Flow: JWT Token vs OTP

### Recommendation: **JWT Token (Simpler for Spring Boot)**

| Feature | JWT Token | 6-Digit OTP |
|---------|-----------|-----------|
| **Complexity** | Lower (built into Spring Security) | Higher (requires SMS/email channel) |
| **Implementation** | Spring Security + JwtProvider | Email + random generation |
| **Token Size** | ~200 bytes (URL-safe) | 6 chars |
| **Expiration** | Cryptographically signed, stateless | DB-backed, requires cleanup |
| **User UX** | Click link, set password | Enter code, set password |

### JWT Token Implementation
```java
// 1. Generate token on forgot-password POST
String token = jwtProvider.generateResetToken(email); // 30-min expiry
// Token contains: sub=email, iat=now, exp=now+30min, typ=reset

// 2. Email token (in link): http://yourapp.com/reset?token=JWT_HERE

// 3. Validate on reset POST
Claims claims = jwtProvider.validateToken(token);
if (claims != null) {
    String email = claims.getSubject();
    // Update password
}
```

**Advantages for this project:**
- No DB state needed (token is stateless)
- No cleanup jobs required
- Works offline (validation via signature)
- Standard in Spring Security ecosystem

### Alternative: OTP
If OTP required: send 6-digit code via email, store in Redis with 10-min TTL, validate before password update.

---

## 4. Elasticsearch Full-Text Search + Filtering

### Setup
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```

**application.properties:**
```properties
spring.elasticsearch.uris=http://localhost:9200
```

### Entity Mapping
```java
@Document(indexName = "products")
public class Product {
    @Id private String id;
    
    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;
    
    @Field(type = FieldType.Keyword)
    private String category;
    
    @Field(type = FieldType.Double)
    private Double price;
}
```

### Repository Queries
```java
public interface ProductRepository extends ElasticsearchRepository<Product, String> {
    
    // Method-name queries
    List<Product> findByNameContaining(String name);
    List<Product> findByCategory(String category);
    List<Product> findByPriceBetween(Double min, Double max);
    
    // Custom @Query with JSON
    @Query("""
        {
            "bool": {
                "must": [
                    {"match": {"name": "?0"}},
                    {"term": {"category": "?1"}}
                ],
                "filter": [
                    {"range": {"price": {"gte": ?2, "lte": ?3}}}
                ]
            }
        }
    """)
    List<Product> searchWithFilter(String name, String category, Double minPrice, Double maxPrice);
}
```

### Key Features
- **Full-text:** `findByNameContaining()` searches partial text with relevance scoring
- **Filters:** Combine `must` (scored) + `filter` (unscored) clauses
- **Aggregations:** Use ElasticsearchTemplate for faceted search (category counts)
- **Pagination:** `ElasticsearchRepository` extends `PagingAndSortingRepository`

---

## Architecture Integration

**Recommended Service Layer:**
```
PaymentService (VNPay)
  ├─ createPaymentUrl()
  ├─ validateIPN()
  └─ updateOrderStatus()

EmailService (Gmail SMTP)
  ├─ sendResetLink()
  └─ sendNotification()

SearchService (Elasticsearch)
  ├─ indexProduct()
  └─ search(query, filters)
```

**Data Flow:**
1. User initiates payment → PaymentService creates VNPay URL
2. After payment → IPN webhook validates signature + updates DB
3. Forgot password → EmailService sends JWT reset link
4. Product search → SearchService queries Elasticsearch with filters

---

## Unresolved Questions

1. **VNPay IP whitelist:** Should IPN requests be restricted to VNPay IPs only? (Requires VNPay to provide range)
2. **Elasticsearch indexing trigger:** On product creation/update, index immediately or use message queue (Kafka)?
3. **Email retry strategy:** Max retries for failed sends? (Recommend: 3 retries with exponential backoff)
4. **OTP vs JWT:** Confirm final choice; if OTP required, need SMS provider (Twilio/MessageBird)

---

## Key Sources

- [VNPay Sandbox Documentation](https://sandbox.vnpayment.vn/apis/docs/gioi-thieu/)
- [HMAC-SHA512 in Java - Baeldung](https://www.baeldung.com/java-hmac)
- [Spring Boot Email Guide - GeeksforGeeks](https://www.geeksforgeeks.org/springboot/spring-boot-sending-email-via-smtp/)
- [Spring Security Forgot Password - Baeldung](https://www.baeldung.com/spring-security-registration-i-forgot-my-password)
- [Spring Data Elasticsearch Queries - Baeldung](https://www.baeldung.com/spring-data-elasticsearch-queries)
- [VNPay Spring Boot Demo - GitHub](https://github.com/pad1092/VNPAY-Springboot-Demo)
- [Full-Text Search with Elasticsearch Spring - Oneuptime 2026](https://oneuptime.com/blog/post/2026-01-28-elasticsearch-full-text-search-spring/view)
