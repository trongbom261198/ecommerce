package com.ecommerce.orderservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Manages flash sale stock quotas in Redis for high-throughput atomic operations.
 *
 * Key schema:
 *   flash_sale:{saleId}:item:{skuId}:stock  → remaining units (Long)
 *   flash_sale:ratelimit:{userId}            → rate-limit sentinel (TTL 5s)
 *
 * Lua scripts ensure atomicity without distributed locks.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FlashSaleRedisService {

    private static final String KEY_STOCK    = "flash_sale:%s:item:%s:stock";
    private static final String KEY_BOUGHT   = "flash_sale:%s:buyer:%s";
    private static final String KEY_RATELIMIT = "flash_sale:ratelimit:%s";

    // Returns new remaining if >= 0, else -1 (sold out)
    private static final DefaultRedisScript<Long> DECR_SCRIPT = new DefaultRedisScript<>("""
            local remaining = tonumber(redis.call('get', KEYS[1]))
            if remaining == nil then return -2 end
            if remaining <= 0   then return -1 end
            return redis.call('decrby', KEYS[1], tonumber(ARGV[1]))
            """, Long.class);

    // Returns 1 if purchase recorded (first time), 0 if duplicate
    private static final DefaultRedisScript<Long> MARK_BOUGHT_SCRIPT = new DefaultRedisScript<>("""
            return redis.call('set', KEYS[1], '1', 'EX', tonumber(ARGV[1]), 'NX') and 1 or 0
            """, Long.class);

    private final StringRedisTemplate redis;

    // ── Quota management ──────────────────────────────────────────────────────

    /** Pre-loads quota into Redis when a flash sale becomes ACTIVE. */
    public void loadQuota(UUID saleId, UUID skuId, int quota) {
        String key = stockKey(saleId, skuId);
        redis.opsForValue().set(key, String.valueOf(quota), Duration.ofDays(7));
        log.info("[FlashSale] Loaded quota {} for sale={} sku={}", quota, saleId, skuId);
    }

    /**
     * Atomically decrements quota by qty.
     *
     * @return remaining stock after decrement, -1 if sold out, -2 if key missing (sale not loaded)
     */
    public long decrementQuota(UUID saleId, UUID skuId, int qty) {
        return executeScript(DECR_SCRIPT, stockKey(saleId, skuId), String.valueOf(qty));
    }

    /** Restores quota (on order cancel/timeout). */
    public void restoreQuota(UUID saleId, UUID skuId, int qty) {
        redis.opsForValue().increment(stockKey(saleId, skuId), qty);
    }

    /** Removes quota key when sale ends. */
    public void clearQuota(UUID saleId, UUID skuId) {
        redis.delete(stockKey(saleId, skuId));
    }

    public Long getRemaining(UUID saleId, UUID skuId) {
        String val = redis.opsForValue().get(stockKey(saleId, skuId));
        return val != null ? Long.parseLong(val) : null;
    }

    // ── Idempotency: one purchase per user per sale ───────────────────────────

    /**
     * Marks that userId has purchased from this sale.
     *
     * @param ttlSeconds how long to keep the record (sale duration + buffer)
     * @return true if first purchase (allowed), false if duplicate
     */
    public boolean markPurchased(UUID saleId, UUID userId, long ttlSeconds) {
        Long result = executeScript(MARK_BOUGHT_SCRIPT, boughtKey(saleId, userId),
                String.valueOf(ttlSeconds));
        return Long.valueOf(1L).equals(result);
    }

    public void clearPurchased(UUID saleId, UUID userId) {
        redis.delete(boughtKey(saleId, userId));
    }

    // ── Rate limiting (5-second cool-down per user) ───────────────────────────

    /**
     * Returns true if the request is allowed (not rate-limited).
     * Implements a simple per-user 5-second cool-down.
     */
    public boolean checkRateLimit(UUID userId) {
        String key = KEY_RATELIMIT.formatted(userId);
        Boolean isNew = redis.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(5));
        return Boolean.TRUE.equals(isNew);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private String stockKey(UUID saleId, UUID skuId) {
        return KEY_STOCK.formatted(saleId, skuId);
    }

    private String boughtKey(UUID saleId, UUID userId) {
        return KEY_BOUGHT.formatted(saleId, userId);
    }

    private long executeScript(DefaultRedisScript<Long> script, String key, String... args) {
        Long result = redis.execute(script, List.of(key), (Object[]) args);
        return result != null ? result : -2L;
    }
}
