package com.ecommerce.analyticsservice.pipeline;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataExportScheduler {

    private final DataExportService exportService;

    // Daily at 02:00
    @Scheduled(cron = "0 0 2 * * *")
    @Async("pipelineExecutor")
    public void scheduledExport() {
        log.info("Pipeline: scheduled daily export triggered");
        exportService.exportAll();
    }
}
