package com.ecommerce.analyticsservice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class RateLimitService {

    private final StringRedisTemplate redis;
    private static final int MAX_PER_MINUTE = 10;

    public boolean tryAcquire(String userId) {
        String key = "analytics:ratelimit:" + userId;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, Duration.ofMinutes(1));
        }
        return count != null && count <= MAX_PER_MINUTE;
    }
}
