package com.ecommerce.deliveryservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.FulfillmentPackedEvent;
import com.ecommerce.deliveryservice.service.ShipmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DeliveryEventConsumer {

    private final ShipmentService shipmentService;

    @KafkaListener(topics = KafkaTopics.FULFILLMENT_PACKED, groupId = "delivery-service")
    public void handleFulfillmentPacked(FulfillmentPackedEvent event) {
        log.info("Received fulfillment.packed event for order {}, shipment {}",
                event.getOrderId(), event.getShipmentId());
        shipmentService.createShipment(event.getOrderId(), null, null);
    }
}
