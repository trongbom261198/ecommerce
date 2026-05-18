package com.ecommerce.userservice.service;

import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.userservice.dto.AuthResponse;
import com.ecommerce.userservice.email.EmailService;
import com.ecommerce.userservice.dto.LoginRequest;
import com.ecommerce.userservice.dto.RefreshRequest;
import com.ecommerce.userservice.dto.RegisterRequest;
import com.ecommerce.userservice.entity.RefreshToken;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.entity.UserRole;
import com.ecommerce.userservice.repository.RefreshTokenRepository;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Date;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RedisTemplate<String, String> redisTemplate;
    private final EmailService emailService;

    @Value("${app.jwt.expire-ms}")
    private long expireMs;

    @Value("${app.jwt.refresh-expire-ms}")
    private long refreshExpireMs;

    private static final String BLACKLIST_PREFIX = "jwt:blacklist:";

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BusinessException(409, "EMAIL_EXISTS", "Email is already registered");
        }

        User user = User.builder()
                .email(request.getEmail())
                .phone(request.getPhone())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(UserRole.CUSTOMER)
                .enabled(true)
                .emailVerified(false)
                .build();

        user = userRepository.save(user);
        emailService.sendWelcome(user.getEmail(), user.getFullName());

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken();

        saveRefreshToken(user, refreshToken);

        return buildAuthResponse(user, accessToken, refreshToken);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    log.warn("Login attempt for non-existent email: {}", request.getEmail());
                    return new BusinessException(401, "INVALID_CREDENTIALS", "Invalid email or password");
                });

        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            log.warn("Login failed - wrong password for email: {}", request.getEmail());
            throw new BusinessException(401, "INVALID_CREDENTIALS", "Invalid email or password");
        }

        if (!user.isEnabled()) {
            throw new BusinessException(403, "ACCOUNT_DISABLED", "Account is disabled");
        }

        refreshTokenRepository.revokeAllByUser(user);

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken();

        saveRefreshToken(user, refreshToken);

        return buildAuthResponse(user, accessToken, refreshToken);
    }

    @Transactional
    public AuthResponse refresh(RefreshRequest request) {
        RefreshToken storedToken = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new BusinessException(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token"));

        if (storedToken.isRevoked()) {
            throw new BusinessException(401, "REVOKED_REFRESH_TOKEN", "Refresh token has been revoked");
        }

        if (storedToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(401, "EXPIRED_REFRESH_TOKEN", "Refresh token has expired");
        }

        User user = storedToken.getUser();

        storedToken.setRevoked(true);
        refreshTokenRepository.save(storedToken);

        String newAccessToken = jwtService.generateAccessToken(user);
        String newRefreshToken = jwtService.generateRefreshToken();

        saveRefreshToken(user, newRefreshToken);

        return buildAuthResponse(user, newAccessToken, newRefreshToken);
    }

    @Transactional
    public void logout(String jti, String userId) {
        userRepository.findById(java.util.UUID.fromString(userId)).ifPresent(user -> {
            refreshTokenRepository.revokeAllByUser(user);
        });

        if (jti != null && !jti.isBlank()) {
            Date expiration = null;
            try {
                expiration = jwtService.getExpirationFromToken(jti);
            } catch (Exception ignored) {
            }

            long ttlMs = expiration != null
                    ? Math.max(expiration.getTime() - System.currentTimeMillis(), 0)
                    : expireMs;

            if (ttlMs > 0) {
                redisTemplate.opsForValue().set(
                        BLACKLIST_PREFIX + jti,
                        "1",
                        ttlMs,
                        TimeUnit.MILLISECONDS
                );
            }
        }
    }

    @Transactional
    public AuthResponse issueTokens(User user) {
        refreshTokenRepository.revokeAllByUser(user);
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken();
        saveRefreshToken(user, refreshToken);
        return buildAuthResponse(user, accessToken, refreshToken);
    }

    private void saveRefreshToken(User user, String token) {
        RefreshToken refreshToken = RefreshToken.builder()
                .user(user)
                .token(token)
                .expiresAt(LocalDateTime.now().plusSeconds(refreshExpireMs / 1000))
                .revoked(false)
                .build();
        refreshTokenRepository.save(refreshToken);
    }

    private AuthResponse buildAuthResponse(User user, String accessToken, String refreshToken) {
        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(expireMs / 1000)
                .userId(user.getId())
                .email(user.getEmail())
                .role(user.getRole())
                .fullName(user.getFullName())
                .build();
    }
}
