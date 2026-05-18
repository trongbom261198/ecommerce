package com.ecommerce.inventoryservice.kafka;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.InventoryReserveRequestedEvent;
import com.ecommerce.inventoryservice.dto.ReserveRequest;
import com.ecommerce.inventoryservice.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryEventConsumer {

    private final InventoryService inventoryService;

    @KafkaListener(topics = KafkaTopics.INVENTORY_RESERVE_REQUESTED, groupId = "inventory-service")
    public void handleReserveRequested(InventoryReserveRequestedEvent event) {
        log.info("Received InventoryReserveRequestedEvent for orderId={}", event.getOrderId());

        ReserveRequest request = new ReserveRequest();
        request.setOrderId(event.getOrderId());
        request.setItems(event.getItems().stream()
                .map(i -> ReserveRequest.ReserveItem.builder()
                        .skuId(UUID.fromString(i.getSkuId()))
                        .warehouseId(i.getWarehouseId() != null ? UUID.fromString(i.getWarehouseId()) : null)
                        .quantity(i.getQuantity())
                        .build())
                .toList());

        inventoryService.reserveStock(request);
    }
}
