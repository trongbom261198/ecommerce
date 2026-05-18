package com.ecommerce.fulfillmentservice.service;

import com.ecommerce.common.constant.KafkaTopics;
import com.ecommerce.common.event.FulfillmentPackedEvent;
import com.ecommerce.common.event.FulfillmentTaskCreatedEvent;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.fulfillmentservice.dto.FulfillmentTaskResponse;
import com.ecommerce.fulfillmentservice.dto.TaskUpdateRequest;
import com.ecommerce.fulfillmentservice.entity.FulfillmentTask;
import com.ecommerce.fulfillmentservice.entity.FulfillmentTaskItem;
import com.ecommerce.fulfillmentservice.repository.FulfillmentTaskRepository;
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
public class FulfillmentService {

    private final FulfillmentTaskRepository taskRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public FulfillmentTask createTask(FulfillmentTaskCreatedEvent event) {
        List<FulfillmentTaskItem> items = event.getItems() == null
                ? List.of()
                : event.getItems().stream()
                        .map(i -> FulfillmentTaskItem.builder()
                                .skuId(UUID.fromString(i.getSkuId()))
                                .skuCode(i.getSkuId())
                                .quantity(i.getQuantity())
                                .pickedQuantity(0)
                                .build())
                        .collect(Collectors.toList());

        UUID warehouseId = null;
        if (event.getItems() != null && !event.getItems().isEmpty()
                && event.getItems().get(0).getWarehouseId() != null) {
            warehouseId = UUID.fromString(event.getItems().get(0).getWarehouseId());
        }

        FulfillmentTask task = FulfillmentTask.builder()
                .orderId(event.getOrderId())
                .shipmentId(event.getShipmentId())
                .status("PENDING")
                .warehouseId(warehouseId)
                .slaDeadline(event.getSlaDeadline())
                .items(items)
                .build();

        FulfillmentTask saved = taskRepository.save(task);
        log.info("Created fulfillment task {} for order {}", saved.getId(), saved.getOrderId());
        return saved;
    }

    public FulfillmentTask updateStatus(UUID taskId, TaskUpdateRequest request) {
        FulfillmentTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NotFoundException("Fulfillment task not found: " + taskId));

        String previousStatus = task.getStatus();
        task.setStatus(request.getStatus());

        if (request.getAssignedTo() != null) {
            task.setAssignedTo(request.getAssignedTo());
            if ("ASSIGNED".equals(request.getStatus()) && task.getAssignedAt() == null) {
                task.setAssignedAt(LocalDateTime.now());
            }
        }

        if ("PICKING".equals(request.getStatus()) && task.getPickedAt() == null) {
            task.setPickedAt(LocalDateTime.now());
        }

        if ("PACKED".equals(request.getStatus())) {
            task.setPackedAt(LocalDateTime.now());
            FulfillmentPackedEvent packedEvent = FulfillmentPackedEvent.builder()
                    .shipmentId(task.getShipmentId())
                    .orderId(task.getOrderId())
                    .packedAt(task.getPackedAt())
                    .build();
            kafkaTemplate.send(KafkaTopics.FULFILLMENT_PACKED, task.getOrderId(), packedEvent);
            log.info("Published {} event for task {} (order {})",
                    KafkaTopics.FULFILLMENT_PACKED, taskId, task.getOrderId());
        }

        FulfillmentTask saved = taskRepository.save(task);
        log.info("Updated fulfillment task {} status: {} -> {}", taskId, previousStatus, request.getStatus());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<FulfillmentTaskResponse> getTasksByStatus(String status) {
        List<FulfillmentTask> tasks = status != null && !status.isBlank()
                ? taskRepository.findByStatus(status)
                : taskRepository.findAll();

        return tasks.stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public FulfillmentTaskResponse getTaskById(UUID id) {
        FulfillmentTask task = taskRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Fulfillment task not found: " + id));
        return toResponse(task);
    }

    private FulfillmentTaskResponse toResponse(FulfillmentTask task) {
        return FulfillmentTaskResponse.builder()
                .id(task.getId())
                .orderId(task.getOrderId())
                .shipmentId(task.getShipmentId())
                .status(task.getStatus())
                .warehouseId(task.getWarehouseId())
                .slaDeadline(task.getSlaDeadline())
                .assignedAt(task.getAssignedAt())
                .pickedAt(task.getPickedAt())
                .packedAt(task.getPackedAt())
                .assignedTo(task.getAssignedTo())
                .items(task.getItems())
                .createdAt(task.getCreatedAt())
                .updatedAt(task.getUpdatedAt())
                .build();
    }
}
