package com.ecommerce.userservice.service;

import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.userservice.dto.AdminStatsResponse;
import com.ecommerce.userservice.dto.AdminUserResponse;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.entity.UserRole;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AdminUserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public Page<AdminUserResponse> getAllUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(this::toAdminUserResponse);
    }

    @Transactional(readOnly = true)
    public AdminStatsResponse getStats() {
        return AdminStatsResponse.builder()
                .totalUsers(userRepository.count())
                .customerCount(userRepository.countByRole(UserRole.CUSTOMER))
                .adminCount(userRepository.countByRole(UserRole.ADMIN))
                .staffCount(userRepository.countByRole(UserRole.STAFF))
                .driverCount(userRepository.countByRole(UserRole.DRIVER))
                .enabledCount(userRepository.countByEnabled(true))
                .build();
    }

    public AdminUserResponse updateRole(UUID userId, UserRole newRole) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found: " + userId));
        user.setRole(newRole);
        return toAdminUserResponse(userRepository.save(user));
    }

    public AdminUserResponse updateStatus(UUID userId, boolean enabled) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found: " + userId));
        user.setEnabled(enabled);
        return toAdminUserResponse(userRepository.save(user));
    }

    private AdminUserResponse toAdminUserResponse(User user) {
        return AdminUserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .phone(user.getPhone())
                .fullName(user.getFullName())
                .role(user.getRole())
                .enabled(user.isEnabled())
                .emailVerified(user.isEmailVerified())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
