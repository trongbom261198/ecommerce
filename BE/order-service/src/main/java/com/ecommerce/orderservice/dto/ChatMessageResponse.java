package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.entity.ChatSenderType;

import java.time.LocalDateTime;
import java.util.UUID;

public record ChatMessageResponse(
        UUID id,
        String roomId,
        ChatSenderType senderType,
        UUID senderId,
        String content,
        LocalDateTime createdAt
) {}
