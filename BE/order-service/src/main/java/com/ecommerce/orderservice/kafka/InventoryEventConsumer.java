package com.ecommerce.orderservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.InventoryReserveFailedEvent;
import com.ecommerce.common.event.InventoryReservedEvent;
import com.ecommerce.orderservice.service.OrderService;
import com.ecommerce.orderservice.statemachine.OrderEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryEventConsumer {

    private final OrderService orderService;

    /**
     * Inventory successfully reserved — transition order PENDING → CONFIRMED.
     */
    @KafkaListener(
            topics = KafkaTopics.INVENTORY_RESERVED,
            groupId = "order-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onInventoryReserved(InventoryReservedEvent event) {
        log.info("Received InventoryReservedEvent for orderId={}", event.getOrderId());
        try {
            orderService.processStateTransition(
                    UUID.fromString(event.getOrderId()),
                    OrderEvent.PAYMENT_CONFIRMED,
                    null,
                    "SYSTEM"
            );
        } catch (Exception e) {
            log.error("Failed to process InventoryReservedEvent for orderId={}: {}",
                    event.getOrderId(), e.getMessage(), e);
        }
    }

    /**
     * Inventory reservation failed — transition order PENDING → CANCELLED.
     */
    @KafkaListener(
            topics = KafkaTopics.INVENTORY_RESERVE_FAILED,
            groupId = "order-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onInventoryReserveFailed(InventoryReserveFailedEvent event) {
        log.warn("Received InventoryReserveFailedEvent for orderId={}, reason={}",
                event.getOrderId(), event.getReason());
        try {
            orderService.processStateTransition(
                    UUID.fromString(event.getOrderId()),
                    OrderEvent.CANCEL,
                    null,
                    "SYSTEM"
            );
        } catch (Exception e) {
            log.error("Failed to process InventoryReserveFailedEvent for orderId={}: {}",
                    event.getOrderId(), e.getMessage(), e);
        }
    }
}
