package com.ecommerce.orderservice.service;

import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.orderservice.dto.*;
import com.ecommerce.orderservice.entity.*;
import com.ecommerce.orderservice.repository.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRoomRepository roomRepo;
    private final ChatMessageRepository messageRepo;
    private final ChatConfigRepository configRepo;
    private final SimpMessagingTemplate ws;
    private final ObjectMapper objectMapper;

    // ── User-facing ──────────────────────────────────────────────────────────

    /** Get existing OPEN room (returns null if none exists yet). */
    @Transactional(readOnly = true)
    public ChatRoomResponse getRoom(UUID userId) {
        return roomRepo.findByUserIdAndStatus(userId, ChatRoomStatus.OPEN)
                .map(r -> toRoomResponse(r, lastMessage(r.getId())))
                .orElse(null);
    }

    /** Create a new room with contact info; sends the welcome message. */
    @Transactional
    public ChatRoomResponse startRoom(UUID userId, String contactName, String contactPhone) {
        // Close any existing open room first
        roomRepo.findByUserIdAndStatus(userId, ChatRoomStatus.OPEN).ifPresent(existing -> {
            existing.setStatus(ChatRoomStatus.CLOSED);
            roomRepo.save(existing);
        });

        ChatRoom room = roomRepo.save(ChatRoom.builder()
                .userId(userId)
                .contactName(contactName)
                .contactPhone(contactPhone)
                .build());

        String welcome = getConfig().getWelcomeMessage();
        saveAndPush(room, ChatSenderType.BOT, null, welcome);

        return toRoomResponse(room, lastMessage(room.getId()));
    }

    /** Clear all messages in a room (user-initiated). */
    @Transactional
    public void clearRoom(UUID userId, UUID roomId) {
        ChatRoom room = requireRoom(roomId);
        if (!room.getUserId().equals(userId)) {
            throw new com.ecommerce.common.exception.UnauthorizedException("Access denied");
        }
        messageRepo.deleteAll(messageRepo.findByRoomIdOrderByCreatedAtAsc(roomId));
        room.setStatus(ChatRoomStatus.CLOSED);
        roomRepo.save(room);
    }

    /** User sends a message; bot may auto-reply if enabled. */
    @Transactional
    public ChatMessageResponse userSend(UUID userId, UUID roomId, String content) {
        ChatRoom room = requireRoom(roomId);
        if (!room.getUserId().equals(userId)) {
            throw new com.ecommerce.common.exception.UnauthorizedException("Access denied");
        }

        ChatMessageResponse msg = saveAndPush(room, ChatSenderType.USER, userId, content);

        // Bot auto-reply
        ChatConfig config = getConfig();
        if (config.isBotEnabled()) {
            String botReply = matchBotRule(config.getBotResponses(), content);
            if (botReply != null) {
                saveAndPush(room, ChatSenderType.BOT, null, botReply);
            }
        }

        return msg;
    }

    public List<ChatMessageResponse> getRoomMessages(UUID userId, UUID roomId) {
        ChatRoom room = requireRoom(roomId);
        if (!room.getUserId().equals(userId)) {
            throw new com.ecommerce.common.exception.UnauthorizedException("Access denied");
        }
        return messageRepo.findByRoomIdOrderByCreatedAtAsc(roomId)
                .stream().map(this::toMessageResponse).toList();
    }

    // ── Admin-facing ─────────────────────────────────────────────────────────

    public Page<ChatRoomResponse> listRooms(Pageable pageable) {
        return roomRepo.findAllByOrderByUpdatedAtDesc(pageable)
                .map(r -> toRoomResponse(r, lastMessage(r.getId())));
    }

    public List<ChatMessageResponse> adminGetMessages(UUID roomId) {
        requireRoom(roomId);
        return messageRepo.findByRoomIdOrderByCreatedAtAsc(roomId)
                .stream().map(this::toMessageResponse).toList();
    }

    @Transactional
    public ChatMessageResponse adminReply(UUID adminId, UUID roomId, String content) {
        ChatRoom room = requireRoom(roomId);
        return saveAndPush(room, ChatSenderType.ADMIN, adminId, content);
    }

    @Transactional
    public void closeRoom(UUID roomId) {
        ChatRoom room = requireRoom(roomId);
        room.setStatus(ChatRoomStatus.CLOSED);
        roomRepo.save(room);
    }

    // ── Config ────────────────────────────────────────────────────────────────

    public ChatConfigResponse getConfigResponse() {
        ChatConfig cfg = getConfig();
        return new ChatConfigResponse(
                cfg.isBotEnabled(),
                cfg.getWelcomeMessage(),
                cfg.getOfflineMessage(),
                parseBotRules(cfg.getBotResponses()));
    }

    @Transactional
    public ChatConfigResponse updateConfig(ChatConfigRequest req) {
        ChatConfig cfg = getConfig();
        cfg.setBotEnabled(req.botEnabled());
        cfg.setWelcomeMessage(req.welcomeMessage());
        cfg.setOfflineMessage(req.offlineMessage());
        cfg.setBotResponses(serializeBotRules(req.botRules()));
        configRepo.save(cfg);
        return getConfigResponse();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private ChatMessageResponse saveAndPush(ChatRoom room, ChatSenderType type, UUID senderId, String content) {
        ChatMessage msg = messageRepo.save(ChatMessage.builder()
                .room(room)
                .senderType(type)
                .senderId(senderId)
                .content(content)
                .build());
        // Update room timestamp
        roomRepo.save(room);
        ChatMessageResponse res = toMessageResponse(msg);
        ws.convertAndSend("/topic/chat/" + room.getId(), res);
        return res;
    }

    private ChatRoom requireRoom(UUID roomId) {
        return roomRepo.findById(roomId)
                .orElseThrow(() -> new NotFoundException("Chat room not found: " + roomId));
    }

    private ChatConfig getConfig() {
        return configRepo.findAll().stream().findFirst()
                .orElseGet(() -> configRepo.save(ChatConfig.builder()
                        .welcomeMessage("Xin chào! Chúng tôi có thể giúp gì cho bạn?")
                        .offlineMessage("Hiện tại chúng tôi đang offline. Vui lòng để lại tin nhắn.")
                        .build()));
    }

    private ChatMessageResponse lastMessage(UUID roomId) {
        List<ChatMessage> msgs = messageRepo.findByRoomIdOrderByCreatedAtAsc(roomId);
        if (msgs.isEmpty()) return null;
        return toMessageResponse(msgs.getLast());
    }

    private String matchBotRule(String botResponsesJson, String userContent) {
        List<ChatBotRule> rules = parseBotRules(botResponsesJson);
        String lower = userContent.toLowerCase();
        return rules.stream()
                .filter(r -> lower.contains(r.keyword().toLowerCase()))
                .map(ChatBotRule::response)
                .findFirst()
                .orElse(null);
    }

    private List<ChatBotRule> parseBotRules(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Failed to parse bot rules: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String serializeBotRules(List<ChatBotRule> rules) {
        if (rules == null || rules.isEmpty()) return "[]";
        try {
            return objectMapper.writeValueAsString(rules);
        } catch (Exception e) {
            return "[]";
        }
    }

    private ChatMessageResponse toMessageResponse(ChatMessage m) {
        return new ChatMessageResponse(
                m.getId(),
                m.getRoom().getId().toString(),
                m.getSenderType(),
                m.getSenderId(),
                m.getContent(),
                m.getCreatedAt());
    }

    private ChatRoomResponse toRoomResponse(ChatRoom r, ChatMessageResponse last) {
        return new ChatRoomResponse(
                r.getId(),
                r.getUserId(),
                r.getStatus(),
                r.getContactName(),
                r.getContactPhone(),
                r.getCreatedAt(),
                r.getUpdatedAt(),
                last);
    }
}
