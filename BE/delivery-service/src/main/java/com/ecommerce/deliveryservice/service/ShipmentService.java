package com.ecommerce.deliveryservice.service;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.OrderDeliveredEvent;
import com.ecommerce.common.event.ShipmentStatusChangedEvent;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.deliveryservice.dto.ShipmentResponse;
import com.ecommerce.deliveryservice.dto.ShipmentStatusUpdateRequest;
import com.ecommerce.deliveryservice.dto.TrackingResponse;
import com.ecommerce.deliveryservice.entity.Shipment;
import com.ecommerce.deliveryservice.repository.ShipmentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class ShipmentService {

    private final ShipmentRepository shipmentRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public Shipment createShipment(String orderId, UUID warehouseId, LocalDateTime slaDeadline) {
        Shipment shipment = Shipment.builder()
                .orderId(UUID.fromString(orderId))
                .fromWarehouseId(warehouseId)
                .status("PENDING")
                .slaDeadline(slaDeadline)
                .trackingNumber(generateTrackingNumber())
                .build();
        Shipment saved = shipmentRepository.save(shipment);
        log.info("Created shipment {} for order {}", saved.getId(), orderId);
        return saved;
    }

    public Shipment updateStatus(UUID shipmentId, ShipmentStatusUpdateRequest request) {
        Shipment shipment = shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> new NotFoundException("Shipment not found: " + shipmentId));

        String oldStatus = shipment.getStatus();
        shipment.setStatus(request.getStatus());
        shipment = shipmentRepository.save(shipment);

        ShipmentStatusChangedEvent event = ShipmentStatusChangedEvent.builder()
                .shipmentId(shipmentId.toString())
                .orderId(shipment.getOrderId().toString())
                .fromStatus(oldStatus)
                .toStatus(request.getStatus())
                .location(request.getLocation())
                .changedAt(LocalDateTime.now())
                .build();
        kafkaTemplate.send(KafkaTopics.SHIPMENT_STATUS_CHANGED, shipmentId.toString(), event);
        log.info("Published {} event for shipment {}: {} -> {}",
                KafkaTopics.SHIPMENT_STATUS_CHANGED, shipmentId, oldStatus, request.getStatus());

        if ("DELIVERED".equals(request.getStatus())) {
            shipment.setActualDelivery(LocalDateTime.now());
            shipment = shipmentRepository.save(shipment);

            OrderDeliveredEvent deliveredEvent = OrderDeliveredEvent.builder()
                    .orderId(shipment.getOrderId().toString())
                    .shipmentId(shipmentId.toString())
                    .deliveredAt(shipment.getActualDelivery())
                    .build();
            kafkaTemplate.send(KafkaTopics.ORDER_DELIVERED, shipment.getOrderId().toString(), deliveredEvent);
            log.info("Published {} event for order {}", KafkaTopics.ORDER_DELIVERED, shipment.getOrderId());
        }

        return shipment;
    }

    @Transactional(readOnly = true)
    public ShipmentResponse getShipmentById(UUID shipmentId) {
        Shipment shipment = shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> new NotFoundException("Shipment not found: " + shipmentId));
        return toResponse(shipment);
    }

    @Transactional(readOnly = true)
    public TrackingResponse getTracking(UUID shipmentId) {
        Shipment shipment = shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> new NotFoundException("Shipment not found: " + shipmentId));

        return TrackingResponse.builder()
                .shipmentId(shipment.getId())
                .trackingNumber(shipment.getTrackingNumber())
                .carrier(shipment.getCarrier())
                .status(shipment.getStatus())
                .estimatedDelivery(shipment.getEstimatedDelivery())
                .events(List.of())
                .build();
    }

    public String optimizeRoute(UUID shipmentId) {
        shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> new NotFoundException("Shipment not found: " + shipmentId));
        // Placeholder for VRP route optimisation (Phase 2 ML integration)
        log.info("Route optimisation requested for shipment {} (Phase 2 placeholder)", shipmentId);
        return "{}";
    }

    @Transactional(readOnly = true)
    public List<ShipmentResponse> getShipmentsByStatus(String status) {
        List<Shipment> shipments = status != null && !status.isBlank()
                ? shipmentRepository.findByStatus(status)
                : shipmentRepository.findAll();
        return shipments.stream().map(this::toResponse).collect(Collectors.toList());
    }

    private ShipmentResponse toResponse(Shipment shipment) {
        return ShipmentResponse.builder()
                .id(shipment.getId())
                .orderId(shipment.getOrderId())
                .trackingNumber(shipment.getTrackingNumber())
                .carrier(shipment.getCarrier())
                .carrierTrackingUrl(shipment.getCarrierTrackingUrl())
                .status(shipment.getStatus())
                .fromWarehouseId(shipment.getFromWarehouseId())
                .estimatedDelivery(shipment.getEstimatedDelivery())
                .actualDelivery(shipment.getActualDelivery())
                .routeData(shipment.getRouteData())
                .slaDeadline(shipment.getSlaDeadline())
                .createdAt(shipment.getCreatedAt())
                .updatedAt(shipment.getUpdatedAt())
                .build();
    }

    private String generateTrackingNumber() {
        return "ECM" + System.currentTimeMillis();
    }
}
