package com.ecommerce.inventoryservice.service;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.InventoryReserveFailedEvent;
import com.ecommerce.common.event.InventoryReservedEvent;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.inventoryservice.dto.InventoryProjection;
import com.ecommerce.inventoryservice.dto.*;
import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class InventoryService {

    private final InventoryRepository inventoryRepository;
    private final WarehouseRepository warehouseRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final RedisTemplate<String, String> redisTemplate;

    private static final String LOCK_PREFIX = "lock:inventory:";
    private static final String STOCK_CACHE_PREFIX = "stock:";
    private static final long LOCK_TIMEOUT = 10L;
    private static final long STOCK_CACHE_TTL = 30L;

    @Transactional(readOnly = true)
    public Page<InventoryResponse> getInventory(UUID skuId, UUID warehouseId, Pageable pageable) {
        return inventoryRepository.findAllWithDetails(skuId, warehouseId, pageable)
                .map(this::toResponse);
    }

    public InventoryResponse adjust(InventoryAdjustRequest request) {
        Inventory inventory = inventoryRepository
                .findBySkuIdAndWarehouseId(request.getSkuId(), request.getWarehouseId())
                .orElseThrow(() -> new NotFoundException(
                        "Inventory not found for skuId=" + request.getSkuId()
                                + " warehouseId=" + request.getWarehouseId()));

        int newQuantity = inventory.getQuantityOnHand() + request.getQuantityDelta();
        if (newQuantity < 0) {
            throw new com.ecommerce.common.exception.BusinessException(
                    400, "INSUFFICIENT_STOCK",
                    "Adjustment would result in negative stock for skuId=" + request.getSkuId());
        }

        log.info("Adjusting inventory skuId={} warehouseId={} delta={} reason={}",
                request.getSkuId(), request.getWarehouseId(),
                request.getQuantityDelta(), request.getReason());

        inventory.setQuantityOnHand(newQuantity);
        Inventory saved = inventoryRepository.save(inventory);
        invalidateStockCache(request.getSkuId(), request.getWarehouseId());
        return toResponse(saved);
    }

    @Transactional
    public void reserveStock(ReserveRequest request) {
        List<ReserveRequest.ReserveItem> reserved = new ArrayList<>();

        try {
            for (ReserveRequest.ReserveItem item : request.getItems()) {
                String lockKey = LOCK_PREFIX + item.getSkuId();
                Boolean acquired = redisTemplate.opsForValue()
                        .setIfAbsent(lockKey, "1", LOCK_TIMEOUT, TimeUnit.SECONDS);

                if (Boolean.FALSE.equals(acquired)) {
                    throw new com.ecommerce.common.exception.BusinessException(
                            409, "LOCK_ACQUISITION_FAILED",
                            "Could not acquire lock for skuId=" + item.getSkuId());
                }

                try {
                    Inventory inventory;
                    if (item.getWarehouseId() != null) {
                        inventory = inventoryRepository
                                .findBySkuIdAndWarehouseIdForUpdate(item.getSkuId(), item.getWarehouseId())
                                .orElseThrow(() -> new NotFoundException(
                                        "Inventory not found for skuId=" + item.getSkuId()
                                                + " warehouseId=" + item.getWarehouseId()));
                    } else {
                        inventory = inventoryRepository.findBySkuIdForUpdate(item.getSkuId())
                                .stream().findFirst()
                                .orElseThrow(() -> new NotFoundException(
                                        "Inventory not found for skuId=" + item.getSkuId()));
                        item.setWarehouseId(inventory.getWarehouse().getId());
                    }

                    if (inventory.getAvailableQuantity() < item.getQuantity()) {
                        throw new com.ecommerce.common.exception.BusinessException(
                                409, "INSUFFICIENT_STOCK",
                                "Insufficient stock for skuId=" + item.getSkuId()
                                        + ". Available=" + inventory.getAvailableQuantity()
                                        + " requested=" + item.getQuantity());
                    }

                    inventory.setQuantityReserved(inventory.getQuantityReserved() + item.getQuantity());
                    inventoryRepository.save(inventory);
                    invalidateStockCache(item.getSkuId(), item.getWarehouseId());
                    reserved.add(item);
                } finally {
                    redisTemplate.delete(lockKey);
                }
            }

            List<InventoryReservedEvent.ReservationResult> results = reserved.stream()
                    .map(item -> InventoryReservedEvent.ReservationResult.builder()
                            .skuId(item.getSkuId().toString())
                            .warehouseId(item.getWarehouseId().toString())
                            .quantity(item.getQuantity())
                            .reservedAt(LocalDateTime.now())
                            .build())
                    .collect(Collectors.toList());

            InventoryReservedEvent event = InventoryReservedEvent.builder()
                    .orderId(request.getOrderId())
                    .results(results)
                    .build();

            kafkaTemplate.send(KafkaTopics.INVENTORY_RESERVED, request.getOrderId(), event);
            log.info("Stock reserved for orderId={}, items={}", request.getOrderId(), reserved.size());

        } catch (Exception ex) {
            log.error("Failed to reserve stock for orderId={}: {}", request.getOrderId(), ex.getMessage());

            // Compensate: release any items already reserved in this attempt
            for (ReserveRequest.ReserveItem reservedItem : reserved) {
                try {
                    inventoryRepository.findBySkuIdAndWarehouseId(
                            reservedItem.getSkuId(), reservedItem.getWarehouseId()
                    ).ifPresent(inv -> {
                        inv.setQuantityReserved(
                                Math.max(0, inv.getQuantityReserved() - reservedItem.getQuantity()));
                        inventoryRepository.save(inv);
                        invalidateStockCache(reservedItem.getSkuId(), reservedItem.getWarehouseId());
                    });
                } catch (Exception compensateEx) {
                    log.error("Compensation failed for skuId={}: {}",
                            reservedItem.getSkuId(), compensateEx.getMessage());
                }
            }

            InventoryReserveFailedEvent failedEvent = InventoryReserveFailedEvent.builder()
                    .orderId(request.getOrderId())
                    .reason(ex.getMessage())
                    .failedAt(LocalDateTime.now())
                    .build();

            kafkaTemplate.send(KafkaTopics.INVENTORY_RESERVE_FAILED, request.getOrderId(), failedEvent);
        }
    }

    @Transactional
    public void releaseStock(ReleaseRequest request) {
        for (ReleaseRequest.ReleaseItem item : request.getItems()) {
            inventoryRepository
                    .findBySkuIdAndWarehouseId(item.getSkuId(), item.getWarehouseId())
                    .ifPresentOrElse(inventory -> {
                        int newReserved = Math.max(0, inventory.getQuantityReserved() - item.getQuantity());
                        inventory.setQuantityReserved(newReserved);

                        if (request.isFulfillmentComplete()) {
                            int newOnHand = Math.max(0, inventory.getQuantityOnHand() - item.getQuantity());
                            inventory.setQuantityOnHand(newOnHand);
                            log.info("Fulfillment complete — decremented onHand for skuId={} warehouseId={}",
                                    item.getSkuId(), item.getWarehouseId());
                        } else {
                            log.info("Order cancelled — released reservation for skuId={} warehouseId={}",
                                    item.getSkuId(), item.getWarehouseId());
                        }

                        inventoryRepository.save(inventory);
                        invalidateStockCache(item.getSkuId(), item.getWarehouseId());
                    }, () -> log.warn("Inventory not found during release: skuId={} warehouseId={}",
                            item.getSkuId(), item.getWarehouseId()));
        }
    }

    private void invalidateStockCache(UUID skuId, UUID warehouseId) {
        String key = STOCK_CACHE_PREFIX + skuId + ":" + warehouseId;
        redisTemplate.delete(key);
    }

    private InventoryResponse toResponse(Inventory inventory) {
        return InventoryResponse.builder()
                .id(inventory.getId())
                .skuId(inventory.getSkuId())
                .warehouseId(inventory.getWarehouse() != null ? inventory.getWarehouse().getId() : null)
                .warehouseName(inventory.getWarehouse() != null ? inventory.getWarehouse().getName() : null)
                .quantityOnHand(inventory.getQuantityOnHand())
                .quantityReserved(inventory.getQuantityReserved())
                .availableQuantity(inventory.getAvailableQuantity())
                .safetyStock(inventory.getSafetyStock())
                .build();
    }

    private InventoryResponse toResponse(InventoryProjection p) {
        return InventoryResponse.builder()
                .id(p.getId())
                .skuId(p.getSkuId())
                .skuCode(p.getSkuCode())
                .productName(p.getProductName())
                .warehouseId(p.getWarehouseId())
                .warehouseName(p.getWarehouseName())
                .quantityOnHand(p.getQuantityOnHand())
                .quantityReserved(p.getQuantityReserved())
                .availableQuantity(p.getQuantityOnHand() - p.getQuantityReserved())
                .safetyStock(p.getSafetyStock())
                .build();
    }
}
