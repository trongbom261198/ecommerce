package com.ecommerce.analyticsservice.service;

import com.ecommerce.analyticsservice.domain.QueryHistory;
import com.ecommerce.analyticsservice.dto.ExecuteRequest;
import com.ecommerce.analyticsservice.dto.ExecuteResponse;
import com.ecommerce.analyticsservice.repository.QueryHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExecuteService {

    private final RestTemplate restTemplate;
    private final RateLimitService rateLimitService;
    private final QueryHistoryRepository historyRepo;
    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${analytics.executor.url}")
    private String executorUrl;

    public ExecuteResponse execute(String userId, ExecuteRequest req) {
        if (!rateLimitService.tryAcquire(userId)) {
            return new ExecuteResponse(List.of(), List.of(), 0, 0, false,
                    "Rate limit exceeded: max 10 requests per minute");
        }

        String cacheKey = "analytics:result:" + buildCacheKey(req);
        ExecuteResponse cached = (ExecuteResponse) redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            log.debug("Cache hit for userId={}", userId);
            return cached;
        }

        ExecuteResponse result;
        try {
            ResponseEntity<ExecuteResponse> resp = restTemplate.postForEntity(
                    executorUrl + "/execute", req, ExecuteResponse.class);
            result = resp.getBody();
            if (result == null) {
                result = new ExecuteResponse(List.of(), List.of(), 0, 0, false, "Empty response from executor");
            }
        } catch (HttpClientErrorException e) {
            result = new ExecuteResponse(List.of(), List.of(), 0, 0, false, e.getResponseBodyAsString());
        } catch (Exception e) {
            result = new ExecuteResponse(List.of(), List.of(), 0, 0, false, e.getMessage());
        }

        saveHistory(UUID.fromString(userId), req, result);

        if (result.error() == null) {
            redisTemplate.opsForValue().set(cacheKey, result, Duration.ofMinutes(5));
        }

        return result;
    }

    private String buildCacheKey(ExecuteRequest req) {
        // Simple hash — language + code combined
        return Integer.toHexString((req.language() + req.code()).hashCode());
    }

    private void saveHistory(UUID userId, ExecuteRequest req, ExecuteResponse res) {
        try {
            QueryHistory h = new QueryHistory();
            h.setUserId(userId);
            h.setLanguage(req.language());
            h.setCode(req.code());
            h.setRowCount(res.rowCount());
            h.setExecMs(res.executionMs());
            h.setStatus(res.error() == null ? "success" : "error");
            h.setErrorMsg(res.error());
            historyRepo.save(h);
        } catch (Exception e) {
            log.warn("Failed to save query history: {}", e.getMessage());
        }
    }
}
