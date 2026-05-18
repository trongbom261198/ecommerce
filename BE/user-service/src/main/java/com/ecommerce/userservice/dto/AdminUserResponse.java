package com.ecommerce.userservice.dto;

import com.ecommerce.userservice.entity.UserRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserResponse {

    private UUID id;
    private String email;
    private String phone;
    private String fullName;
    private UserRole role;
    private boolean enabled;
    private boolean emailVerified;
    private LocalDateTime createdAt;
}
