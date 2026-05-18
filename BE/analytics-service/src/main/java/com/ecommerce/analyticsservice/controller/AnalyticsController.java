package com.ecommerce.analyticsservice.controller;

import com.ecommerce.analyticsservice.dto.DatasetDto;
import com.ecommerce.analyticsservice.dto.ExecuteRequest;
import com.ecommerce.analyticsservice.dto.ExecuteResponse;
import com.ecommerce.analyticsservice.dto.QueryHistoryResponse;
import com.ecommerce.analyticsservice.pipeline.DataExportService;
import com.ecommerce.analyticsservice.repository.QueryHistoryRepository;
import com.ecommerce.analyticsservice.service.DatasetService;
import com.ecommerce.analyticsservice.service.ExecuteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final ExecuteService executeService;
    private final DatasetService datasetService;
    private final QueryHistoryRepository historyRepo;
    private final DataExportService exportService;

    @PostMapping("/execute")
    public ResponseEntity<ExecuteResponse> execute(
            @RequestHeader(value = "X-User-Id", defaultValue = "") String userId,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @Valid @RequestBody ExecuteRequest req) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(executeService.execute(userId, req));
    }

    @GetMapping("/datasets")
    public ResponseEntity<Map<String, List<DatasetDto>>> datasets(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(Map.of("datasets", datasetService.listAll()));
    }

    @GetMapping("/history")
    public ResponseEntity<Map<String, List<QueryHistoryResponse>>> history(
            @RequestHeader(value = "X-User-Id", defaultValue = "") String userId,
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        List<QueryHistoryResponse> items = historyRepo
                .findByUserIdOrderByCreatedAtDesc(UUID.fromString(userId), PageRequest.of(0, 10))
                .stream().map(QueryHistoryResponse::from).toList();
        return ResponseEntity.ok(Map.of("content", items));
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<Void> deleteHistory(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role,
            @PathVariable UUID id) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        historyRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/admin/pipeline/run")
    public ResponseEntity<Map<String, String>> triggerPipeline(
            @RequestHeader(value = "X-User-Role", defaultValue = "") String role) {
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        CompletableFuture.runAsync(exportService::exportAll);
        return ResponseEntity.ok(Map.of("message", "Pipeline started in background"));
    }
}
