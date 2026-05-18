package com.ecommerce.orderservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.OrderDeliveredEvent;
import com.ecommerce.common.event.ShipmentStatusChangedEvent;
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
public class DeliveryEventConsumer {

    private final OrderService orderService;

    /**
     * Shipment status changed — map the shipment status to an order state-machine event
     * and trigger the appropriate transition.
     */
    @KafkaListener(
            topics = KafkaTopics.SHIPMENT_STATUS_CHANGED,
            groupId = "order-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onShipmentStatusChanged(ShipmentStatusChangedEvent event) {
        log.info("Received ShipmentStatusChangedEvent orderId={} from={} to={} location={}",
                event.getOrderId(), event.getFromStatus(), event.getToStatus(), event.getLocation());

        if (event.getOrderId() == null || event.getOrderId().isBlank()) {
            log.warn("ShipmentStatusChangedEvent has no orderId — skipping");
            return;
        }

        OrderEvent orderEvent = resolveOrderEvent(event.getToStatus());
        if (orderEvent == null) {
            log.debug("No order state transition mapped for shipment status '{}' — ignoring",
                    event.getToStatus());
            return;
        }

        try {
            orderService.processStateTransition(
                    UUID.fromString(event.getOrderId()),
                    orderEvent,
                    null,
                    "DELIVERY_SERVICE"
            );
        } catch (Exception e) {
            log.error("Failed to process ShipmentStatusChangedEvent for orderId={}: {}",
                    event.getOrderId(), e.getMessage(), e);
        }
    }

    /**
     * Order confirmed delivered — transition order to DELIVERED state.
     */
    @KafkaListener(
            topics = KafkaTopics.ORDER_DELIVERED,
            groupId = "order-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onOrderDelivered(OrderDeliveredEvent event) {
        log.info("Received OrderDeliveredEvent for orderId={}", event.getOrderId());
        try {
            orderService.processStateTransition(
                    UUID.fromString(event.getOrderId()),
                    OrderEvent.DELIVERY_CONFIRMED,
                    null,
                    "DELIVERY_SERVICE"
            );
        } catch (Exception e) {
            log.error("Failed to process OrderDeliveredEvent for orderId={}: {}",
                    event.getOrderId(), e.getMessage(), e);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Maps a shipment-service status string to the corresponding order state-machine event.
     * Returns {@code null} when the shipment status does not require an order transition.
     */
    private OrderEvent resolveOrderEvent(String shipmentStatus) {
        if (shipmentStatus == null) {
            return null;
        }
        return switch (shipmentStatus.toUpperCase()) {
            case "PICKED_UP"          -> OrderEvent.CARRIER_PICKED_UP;
            case "IN_TRANSIT"         -> null;  // intermediate — no order-level transition
            case "OUT_FOR_DELIVERY"   -> null;  // intermediate — no order-level transition
            case "DELIVERED"          -> OrderEvent.DELIVERY_CONFIRMED;
            default -> {
                log.debug("Unrecognised shipment status '{}' — no order transition mapped", shipmentStatus);
                yield null;
            }
        };
    }
}
