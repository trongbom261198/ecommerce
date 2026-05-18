package com.ecommerce.userservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.userservice.dto.AdminStatsResponse;
import com.ecommerce.userservice.dto.AdminUserResponse;
import com.ecommerce.userservice.entity.UserRole;
import com.ecommerce.userservice.service.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin - Users", description = "Admin user management")
public class AdminUserController {

    private final AdminUserService adminUserService;

    @GetMapping("/users")
    @Operation(summary = "List all users")
    public ResponseEntity<ApiResponse<PageResponse<AdminUserResponse>>> getAllUsers(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        checkAdmin(authentication);
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResponse<AdminUserResponse> result = PageResponse.from(adminUserService.getAllUsers(pageable));
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/stats")
    @Operation(summary = "Get user and system stats")
    public ResponseEntity<ApiResponse<AdminStatsResponse>> getStats(Authentication authentication) {
        checkAdmin(authentication);
        return ResponseEntity.ok(ApiResponse.ok(adminUserService.getStats()));
    }

    @PutMapping("/users/{id}/role")
    @Operation(summary = "Update user role")
    public ResponseEntity<ApiResponse<AdminUserResponse>> updateRole(
            Authentication authentication,
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        checkAdmin(authentication);
        UserRole newRole = UserRole.valueOf(body.get("role").toUpperCase());
        return ResponseEntity.ok(ApiResponse.ok(adminUserService.updateRole(id, newRole)));
    }

    @PutMapping("/users/{id}/status")
    @Operation(summary = "Enable or disable a user")
    public ResponseEntity<ApiResponse<AdminUserResponse>> updateStatus(
            Authentication authentication,
            @PathVariable UUID id,
            @RequestBody Map<String, Boolean> body) {
        checkAdmin(authentication);
        boolean enabled = body.getOrDefault("enabled", true);
        return ResponseEntity.ok(ApiResponse.ok(adminUserService.updateStatus(id, enabled)));
    }

    private void checkAdmin(Authentication authentication) {
        if (authentication == null || authentication.getAuthorities().stream()
                .noneMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) {
            throw new UnauthorizedException("Admin access required");
        }
    }
}
