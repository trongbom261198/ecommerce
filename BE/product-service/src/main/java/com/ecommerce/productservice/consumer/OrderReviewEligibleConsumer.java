package com.ecommerce.productservice.consumer;

import com.ecommerce.common.event.OrderReviewEligibleEvent;
import com.ecommerce.productservice.service.ReviewService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderReviewEligibleConsumer {

    private final ReviewService reviewService;

    @KafkaListener(
            topics = "order.review_eligible",
            groupId = "product-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void handle(OrderReviewEligibleEvent event) {
        log.info("Received review-eligible event: orderId={} userId={} products={}",
                event.getOrderId(), event.getUserId(), event.getProductIds());
        try {
            reviewService.markPurchased(event.getUserId(), event.getProductIds());
        } catch (Exception e) {
            log.error("Failed to process review-eligible event for order {}: {}",
                    event.getOrderId(), e.getMessage(), e);
            // Do not rethrow — idempotent, safe to log and continue
        }
    }
}
