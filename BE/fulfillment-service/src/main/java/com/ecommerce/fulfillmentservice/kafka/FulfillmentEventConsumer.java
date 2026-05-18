package com.ecommerce.fulfillmentservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.FulfillmentTaskCreatedEvent;
import com.ecommerce.common.event.InventoryReservedEvent;
import com.ecommerce.fulfillmentservice.service.FulfillmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class FulfillmentEventConsumer {

    private final FulfillmentService fulfillmentService;

    @KafkaListener(topics = KafkaTopics.INVENTORY_RESERVED, groupId = "fulfillment-service")
    public void handleInventoryReserved(InventoryReservedEvent event) {
        log.info("Received inventory.reserved event for order {}", event.getOrderId());

        List<FulfillmentTaskCreatedEvent.FulfillmentItem> fulfillmentItems = event.getResults() == null
                ? List.of()
                : event.getResults().stream()
                        .map(r -> FulfillmentTaskCreatedEvent.FulfillmentItem.builder()
                                .skuId(r.getSkuId())
                                .quantity(r.getQuantity())
                                .warehouseId(r.getWarehouseId())
                                .build())
                        .collect(Collectors.toList());

        FulfillmentTaskCreatedEvent taskEvent = FulfillmentTaskCreatedEvent.builder()
                .orderId(event.getOrderId())
                .shipmentId(null)
                .items(fulfillmentItems)
                .slaDeadline(null)
                .build();

        fulfillmentService.createTask(taskEvent);
    }
}
