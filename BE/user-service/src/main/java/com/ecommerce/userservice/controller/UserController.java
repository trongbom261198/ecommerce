package com.ecommerce.userservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.userservice.dto.*;
import com.ecommerce.userservice.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User profile and address management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class UserController {

    private final UserService userService;

    @GetMapping("/me")
    @Operation(summary = "Get current user profile")
    public ResponseEntity<ApiResponse<UserResponse>> getProfile(Authentication authentication) {
        UUID userId = extractUserId(authentication);
        UserResponse response = userService.getProfile(userId);
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @PutMapping("/me")
    @Operation(summary = "Update current user profile")
    public ResponseEntity<ApiResponse<UserResponse>> updateProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateProfileRequest request) {
        UUID userId = extractUserId(authentication);
        UserResponse response = userService.updateProfile(userId, request);
        return ResponseEntity.ok(ApiResponse.ok("Profile updated successfully", response));
    }

    @PutMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Change password")
    public ResponseEntity<Void> changePassword(
            Authentication authentication,
            @Valid @RequestBody ChangePasswordRequest request) {
        UUID userId = extractUserId(authentication);
        userService.changePassword(userId, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/addresses")
    @Operation(summary = "Get all addresses for current user")
    public ResponseEntity<ApiResponse<List<AddressResponse>>> getAddresses(Authentication authentication) {
        UUID userId = extractUserId(authentication);
        List<AddressResponse> addresses = userService.getAddresses(userId);
        return ResponseEntity.ok(ApiResponse.ok(addresses));
    }

    @PostMapping("/me/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a new address")
    public ResponseEntity<ApiResponse<AddressResponse>> addAddress(
            Authentication authentication,
            @Valid @RequestBody AddressRequest request) {
        UUID userId = extractUserId(authentication);
        AddressResponse response = userService.addAddress(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Address added successfully", response));
    }

    @PutMapping("/me/addresses/{id}")
    @Operation(summary = "Update an address")
    public ResponseEntity<ApiResponse<AddressResponse>> updateAddress(
            Authentication authentication,
            @PathVariable UUID id,
            @Valid @RequestBody AddressRequest request) {
        UUID userId = extractUserId(authentication);
        AddressResponse response = userService.updateAddress(userId, id, request);
        return ResponseEntity.ok(ApiResponse.ok("Address updated successfully", response));
    }

    @DeleteMapping("/me/addresses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an address")
    public ResponseEntity<Void> deleteAddress(
            Authentication authentication,
            @PathVariable UUID id) {
        UUID userId = extractUserId(authentication);
        userService.deleteAddress(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/me/addresses/{id}/default")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Set an address as default")
    public ResponseEntity<Void> setDefaultAddress(
            Authentication authentication,
            @PathVariable UUID id) {
        UUID userId = extractUserId(authentication);
        userService.setDefaultAddress(userId, id);
        return ResponseEntity.noContent().build();
    }

    private UUID extractUserId(Authentication authentication) {
        return UUID.fromString((String) authentication.getPrincipal());
    }
}
