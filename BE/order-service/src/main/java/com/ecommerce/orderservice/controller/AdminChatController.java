package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.orderservice.dto.*;
import com.ecommerce.orderservice.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/chat")
@RequiredArgsConstructor
public class AdminChatController {

    private final ChatService chatService;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<PageResponse<ChatRoomResponse>>> listRooms(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        requireAdmin(role);
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt"));
        return ResponseEntity.ok(ApiResponse.ok(PageResponse.from(chatService.listRooms(pageable))));
    }

    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getMessages(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @PathVariable UUID roomId) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(chatService.adminGetMessages(roomId)));
    }

    @PostMapping("/rooms/{roomId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> reply(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @RequestHeader("X-User-Id") String adminId,
            @PathVariable UUID roomId,
            @Valid @RequestBody SendMessageRequest req) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(
                chatService.adminReply(UUID.fromString(adminId), roomId, req.content())));
    }

    @PostMapping("/rooms/{roomId}/close")
    public ResponseEntity<ApiResponse<Void>> closeRoom(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @PathVariable UUID roomId) {
        requireAdmin(role);
        chatService.closeRoom(roomId);
        return ResponseEntity.ok(ApiResponse.ok("Room closed", null));
    }

    @GetMapping("/config")
    public ResponseEntity<ApiResponse<ChatConfigResponse>> getConfig(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok(chatService.getConfigResponse()));
    }

    @PutMapping("/config")
    public ResponseEntity<ApiResponse<ChatConfigResponse>> updateConfig(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @Valid @RequestBody ChatConfigRequest req) {
        requireAdmin(role);
        return ResponseEntity.ok(ApiResponse.ok("Config updated", chatService.updateConfig(req)));
    }

    private void requireAdmin(String role) {
        if (!"ADMIN".equals(role)) throw new UnauthorizedException("Admin access required");
    }
}
