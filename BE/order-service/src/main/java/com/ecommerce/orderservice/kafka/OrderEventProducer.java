package com.ecommerce.orderservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.InventoryReserveRequestedEvent;
import com.ecommerce.common.event.OrderCreatedEvent;
import com.ecommerce.common.event.OrderReviewEligibleEvent;
import com.ecommerce.common.event.OrderStatusChangedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void publishOrderCreated(OrderCreatedEvent event) {
        send(KafkaTopics.ORDER_CREATED, event.getOrderId(), event);
    }

    public void publishOrderStatusChanged(OrderStatusChangedEvent event) {
        send(KafkaTopics.ORDER_STATUS_CHANGED, event.getOrderId(), event);
    }

    public void publishInventoryReserveRequested(InventoryReserveRequestedEvent event) {
        send(KafkaTopics.INVENTORY_RESERVE_REQUESTED, event.getOrderId(), event);
    }

    public void publishOrderReviewEligible(OrderReviewEligibleEvent event) {
        send(KafkaTopics.ORDER_REVIEW_ELIGIBLE, event.getOrderId(), event);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void send(String topic, String key, Object payload) {
        CompletableFuture<SendResult<String, Object>> future =
                kafkaTemplate.send(topic, key, payload);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish event to topic {}: {}", topic, ex.getMessage(), ex);
            } else {
                log.debug("Published event to topic {} partition {} offset {}",
                        topic,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}
