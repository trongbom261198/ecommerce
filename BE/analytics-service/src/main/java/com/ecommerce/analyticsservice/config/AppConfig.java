package com.ecommerce.analyticsservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.concurrent.Executor;

@Configuration
public class AppConfig {

    @Value("${analytics.executor.internal-api-key}")
    private String executorApiKey;

    @Bean
    public RestTemplate restTemplate() {
        RestTemplate tpl = new RestTemplate();
        // Attach shared secret header on every call to analytics-executor
        ClientHttpRequestInterceptor auth = (req, body, execution) -> {
            req.getHeaders().set("X-Internal-Key", executorApiKey);
            return execution.execute(req, body);
        };
        tpl.setInterceptors(List.of(auth));
        return tpl;
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> tpl = new RedisTemplate<>();
        tpl.setConnectionFactory(factory);
        tpl.setKeySerializer(new StringRedisSerializer());
        // No-arg constructor enables @class type metadata — required for proper deserialization
        tpl.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        return tpl;
    }

    @Bean("pipelineExecutor")
    public Executor pipelineExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(1);
        exec.setMaxPoolSize(2);
        exec.setThreadNamePrefix("pipeline-");
        exec.initialize();
        return exec;
    }
}
