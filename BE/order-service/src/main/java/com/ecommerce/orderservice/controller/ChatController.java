package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.orderservice.dto.*;
import com.ecommerce.orderservice.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    /** Public chatbox config — welcome message, mode indicator for the customer widget. */
    @GetMapping("/config")
    public ResponseEntity<ApiResponse<ChatConfigResponse>> getConfig() {
        return ResponseEntity.ok(ApiResponse.ok(chatService.getConfigResponse()));
    }

    /** Check if user already has an open room (null data = no room yet → show pre-chat form). */
    @GetMapping("/room")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> getRoom(
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(ApiResponse.ok(chatService.getRoom(UUID.fromString(userId))));
    }

    /** Start a new chat room with contact info (shown once before first message). */
    @PostMapping("/room")
    public ResponseEntity<ApiResponse<ChatRoomResponse>> startRoom(
            @RequestHeader("X-User-Id") String userId,
            @Valid @RequestBody StartChatRequest req) {
        ChatRoomResponse room = chatService.startRoom(
                UUID.fromString(userId), req.contactName(), req.contactPhone());
        return ResponseEntity.ok(ApiResponse.ok(room));
    }

    /** Clear chat history and close the room. */
    @DeleteMapping("/room/{roomId}")
    public ResponseEntity<ApiResponse<Void>> clearRoom(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable UUID roomId) {
        chatService.clearRoom(UUID.fromString(userId), roomId);
        return ResponseEntity.ok(ApiResponse.ok("Chat cleared", null));
    }

    @GetMapping("/room/{roomId}/messages")
    public ResponseEntity<ApiResponse<List<ChatMessageResponse>>> getMessages(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable UUID roomId) {
        return ResponseEntity.ok(ApiResponse.ok(chatService.getRoomMessages(UUID.fromString(userId), roomId)));
    }

    @PostMapping("/room/{roomId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageResponse>> send(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable UUID roomId,
            @Valid @RequestBody SendMessageRequest req) {
        ChatMessageResponse msg = chatService.userSend(UUID.fromString(userId), roomId, req.content());
        return ResponseEntity.ok(ApiResponse.ok(msg));
    }
}
