package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.entity.ChatRoomStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public record ChatRoomResponse(
        UUID id,
        UUID userId,
        ChatRoomStatus status,
        String contactName,
        String contactPhone,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        ChatMessageResponse lastMessage
) {}
