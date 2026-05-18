package com.ecommerce.gateway.filter;

import com.ecommerce.gateway.config.AppProperties;
import com.ecommerce.gateway.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtProperties jwtProperties;
    private final AppProperties appProperties;

    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (isPublicPath(exchange)) {
            // Soft auth: inject user headers from JWT if present, but don't block if absent/invalid
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                try {
                    SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
                    Claims claims = Jwts.parser()
                            .verifyWith(key)
                            .build()
                            .parseSignedClaims(authHeader.substring(7))
                            .getPayload();
                    ServerHttpRequest mutated = injectUserHeaders(exchange.getRequest(), claims);
                    return chain.filter(exchange.mutate().request(mutated).build());
                } catch (JwtException | IllegalArgumentException ignored) {
                    // Invalid token on public path — pass through without user headers
                }
            }
            return chain.filter(exchange);
        }

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange, "Missing or invalid Authorization header");
        }

        try {
            SecretKey key = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));

            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(authHeader.substring(7))
                    .getPayload();

            return chain.filter(exchange.mutate().request(injectUserHeaders(exchange.getRequest(), claims)).build());

        } catch (JwtException | IllegalArgumentException e) {
            log.warn("JWT validation failed for path {}: {}", path, e.getMessage());
            return unauthorized(exchange, "Invalid or expired token");
        }
    }

    private ServerHttpRequest injectUserHeaders(ServerHttpRequest request, Claims claims) {
        String userId   = claims.getSubject();
        String email    = claims.get("email",    String.class);
        String role     = claims.get("role",     String.class);
        String fullName = claims.get("fullName", String.class);
        return request.mutate()
                .header("X-User-Id",    userId   != null ? userId   : "")
                .header("X-User-Email", email    != null ? email    : "")
                .header("X-User-Role",  role     != null ? role     : "")
                .header("X-User-Name",  fullName != null ? fullName : "")
                .build();
    }

    // Read-only endpoints that are public; write methods on the same paths require auth
    private static final java.util.Set<String> READ_ONLY_PUBLIC_PREFIXES = java.util.Set.of(
            "/api/v1/products", "/api/v1/categories"
    );

    private boolean isPublicPath(ServerWebExchange exchange) {
        String path = exchange.getRequest().getURI().getPath();
        String method = exchange.getRequest().getMethod() != null
                ? exchange.getRequest().getMethod().name() : "GET";

        if (appProperties.getPublicPaths() == null) return false;

        return appProperties.getPublicPaths().stream().anyMatch(pattern -> {
            if (!pathMatcher.match(pattern, path)) return false;
            // Product & category paths are public for GET only
            boolean isReadOnlyPrefix = READ_ONLY_PUBLIC_PREFIXES.stream()
                    .anyMatch(path::startsWith);
            if (isReadOnlyPrefix) {
                return "GET".equalsIgnoreCase(method);
            }
            return true;
        });
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        String body = String.format(
                "{\"success\":false,\"message\":\"%s\",\"timestamp\":%d}",
                message,
                System.currentTimeMillis()
        );

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        return response.writeWith(
                Mono.just(response.bufferFactory().wrap(bytes))
        );
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
