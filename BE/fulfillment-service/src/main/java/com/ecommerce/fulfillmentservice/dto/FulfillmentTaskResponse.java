package com.ecommerce.fulfillmentservice.dto;

import com.ecommerce.fulfillmentservice.entity.FulfillmentTaskItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FulfillmentTaskResponse {

    private UUID id;
    private String orderId;
    private String shipmentId;
    private String status;
    private UUID warehouseId;
    private LocalDateTime slaDeadline;
    private LocalDateTime assignedAt;
    private LocalDateTime pickedAt;
    private LocalDateTime packedAt;
    private UUID assignedTo;
    private List<FulfillmentTaskItem> items;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
