package com.ecommerce.orderservice.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Controller
@RequiredArgsConstructor
public class OrderTrackingController {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Client subscribes to /topic/orders/{orderId} and sends a ping to /app/orders/{orderId}/track
     * to confirm subscription. Server echoes back current status (caller handles it separately).
     */
    @MessageMapping("/orders/{orderId}/track")
    @SendTo("/topic/orders/{orderId}")
    public Map<String, Object> subscribe(@DestinationVariable UUID orderId) {
        log.debug("Client subscribed to order tracking: {}", orderId);
        return Map.of(
                "orderId", orderId.toString(),
                "type", "SUBSCRIBED",
                "timestamp", LocalDateTime.now().toString()
        );
    }

    /**
     * Push a status-changed notification to all subscribers of /topic/orders/{orderId}.
     * Called internally by OrderService after each state transition.
     */
    public void notifyOrderUpdate(UUID orderId, String status) {
        Map<String, Object> payload = Map.of(
                "orderId", orderId.toString(),
                "status", status,
                "type", "STATUS_CHANGED",
                "timestamp", LocalDateTime.now().toString()
        );
        messagingTemplate.convertAndSend("/topic/orders/" + orderId, payload);
        log.debug("WebSocket update sent for order {}: status={}", orderId, status);
    }
}
