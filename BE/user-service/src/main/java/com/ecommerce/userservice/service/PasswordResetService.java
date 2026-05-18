package com.ecommerce.userservice.service;

import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.userservice.email.EmailService;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.repository.RefreshTokenRepository;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final RedisTemplate<String, String> redisTemplate;
    private final EmailService emailService;

    private static final String OTP_PREFIX      = "otp:";
    private static final String RL_PREFIX       = "otp:rl:";
    private static final String ATTEMPTS_PREFIX = "otp:attempts:";
    private static final Duration TTL    = Duration.ofMinutes(5);
    private static final Duration RL_TTL = Duration.ofHours(1);
    private static final int MAX_REQUESTS = 5;
    private static final int MAX_ATTEMPTS = 5;

    private final SecureRandom secureRandom = new SecureRandom();

    public void requestOtp(String email) {
        // Rate-limit: max MAX_REQUESTS requests per hour per email
        Long count = redisTemplate.opsForValue().increment(RL_PREFIX + email);
        if (count != null && count == 1) {
            redisTemplate.expire(RL_PREFIX + email, RL_TTL);
        }
        if (count != null && count > MAX_REQUESTS) {
            log.warn("OTP rate limit exceeded for email hash [{}]", email.hashCode());
            return; // Silent return — don't reveal limit to caller
        }

        // Silent return if user not found — don't leak email existence
        if (!userRepository.existsByEmail(email)) {
            return;
        }

        String otp = String.format("%06d", secureRandom.nextInt(1_000_000));
        redisTemplate.opsForValue().set(OTP_PREFIX + email, otp, TTL);
        emailService.sendOtp(email, otp); // sendOtp is async — never log otp value
        log.info("OTP requested for email hash [{}]", email.hashCode());
    }

    @Transactional
    public void reset(String email, String otp, String newPassword) {
        String stored = redisTemplate.opsForValue().get(OTP_PREFIX + email);
        if (stored == null) {
            throw new BusinessException(400, "OTP_EXPIRED", "Mã OTP đã hết hạn");
        }

        if (!stored.equals(otp)) {
            Long attempts = redisTemplate.opsForValue().increment(ATTEMPTS_PREFIX + email);
            if (attempts != null && attempts == 1) {
                redisTemplate.expire(ATTEMPTS_PREFIX + email, TTL);
            }
            if (attempts != null && attempts >= MAX_ATTEMPTS) {
                redisTemplate.delete(OTP_PREFIX + email);
                log.warn("OTP invalidated after max attempts for email hash [{}]", email.hashCode());
            }
            throw new BusinessException(400, "INVALID_OTP", "Mã OTP không đúng");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        refreshTokenRepository.revokeAllByUser(user);

        // Clean up Redis keys
        redisTemplate.delete(OTP_PREFIX + email);
        redisTemplate.delete(ATTEMPTS_PREFIX + email);

        log.info("Password reset successful for email hash [{}]", email.hashCode());
    }
}
