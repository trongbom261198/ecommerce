package com.ecommerce.fulfillmentservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.fulfillmentservice.dto.FulfillmentTaskResponse;
import com.ecommerce.fulfillmentservice.dto.TaskUpdateRequest;
import com.ecommerce.fulfillmentservice.entity.FulfillmentTask;
import com.ecommerce.fulfillmentservice.service.FulfillmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/fulfillment/tasks")
@RequiredArgsConstructor
public class FulfillmentController {

    private final FulfillmentService fulfillmentService;

    /**
     * GET /api/v1/fulfillment/tasks?status=PENDING
     * List all fulfillment tasks, optionally filtered by status.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<FulfillmentTaskResponse>>> getTasks(
            @RequestParam(required = false) String status) {
        List<FulfillmentTaskResponse> tasks = fulfillmentService.getTasksByStatus(status);
        return ResponseEntity.ok(ApiResponse.<List<FulfillmentTaskResponse>>builder()
                .success(true)
                .message("Tasks retrieved successfully")
                .data(tasks)
                .build());
    }

    /**
     * GET /api/v1/fulfillment/tasks/{id}
     * Retrieve a single fulfillment task by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<FulfillmentTaskResponse>> getTask(@PathVariable UUID id) {
        FulfillmentTaskResponse task = fulfillmentService.getTaskById(id);
        return ResponseEntity.ok(ApiResponse.<FulfillmentTaskResponse>builder()
                .success(true)
                .message("Task retrieved successfully")
                .data(task)
                .build());
    }

    /**
     * PUT /api/v1/fulfillment/tasks/{id}/status
     * Update task status (STAFF/ADMIN roles).
     */
    @PutMapping("/{id}/status")
    public ResponseEntity<ApiResponse<FulfillmentTaskResponse>> updateTaskStatus(
            @PathVariable UUID id,
            @RequestBody TaskUpdateRequest request) {
        FulfillmentTask updated = fulfillmentService.updateStatus(id, request);
        FulfillmentTaskResponse response = fulfillmentService.getTaskById(updated.getId());
        return ResponseEntity.ok(ApiResponse.<FulfillmentTaskResponse>builder()
                .success(true)
                .message("Task status updated successfully")
                .data(response)
                .build());
    }
}
