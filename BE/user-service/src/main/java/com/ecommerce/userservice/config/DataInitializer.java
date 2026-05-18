package com.ecommerce.userservice.config;

import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.entity.UserRole;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(ApplicationArguments args) {
        upsertSeedUser("admin@ecommerce.com", "Admin@123", "System Administrator", UserRole.ADMIN);
        upsertSeedUser("customer@ecommerce.com", "Admin@123", "Sample Customer", UserRole.CUSTOMER);
    }

    private void upsertSeedUser(String email, String password, String fullName, UserRole role) {
        Optional<User> existing = userRepository.findByEmail(email);
        if (existing.isPresent()) {
            User user = existing.get();
            // Migration V12 shipped with a wrong BCrypt hash — fix it on startup
            if (!passwordEncoder.matches(password, user.getPasswordHash())) {
                log.info("Fixing incorrect password hash for seed user: {}", email);
                user.setPasswordHash(passwordEncoder.encode(password));
                userRepository.save(user);
            }
            return;
        }
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .fullName(fullName)
                .role(role)
                .enabled(true)
                .emailVerified(true)
                .build();
        userRepository.save(user);
        log.info("Created seed user: {} with role {}", email, role);
    }
}
