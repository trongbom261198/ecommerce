package com.ecommerce.analyticsservice.pipeline;

import com.ecommerce.analyticsservice.service.DatasetService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class DataExportService {

    private final RestTemplate restTemplate;
    private final DatasetService datasetService;

    @Value("${analytics.executor.url}")
    private String executorUrl;

    public void exportAll() {
        log.info("Pipeline: starting export of {} tables", TableExportConfig.defaults().size());
        for (TableExportConfig cfg : TableExportConfig.defaults()) {
            try {
                exportTable(cfg);
            } catch (Exception e) {
                log.error("Pipeline: failed to export table={} error={}", cfg.name(), e.getMessage());
            }
        }
        log.info("Pipeline: export complete");
    }

    private void exportTable(TableExportConfig cfg) {
        log.info("Pipeline: exporting table={}", cfg.name());
        long start = System.currentTimeMillis();

        Map<String, String> req = Map.of(
                "table", cfg.name(),
                "where_clause", cfg.whereClause(),
                "dest_key", cfg.destKey()
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> resp = restTemplate.postForObject(
                executorUrl + "/pipeline/export-table", req, Map.class);

        if (resp == null) {
            throw new RuntimeException("Null response from executor pipeline endpoint");
        }

        int rowCount = ((Number) resp.get("rowCount")).intValue();
        log.info("Pipeline: done table={} rows={} ms={}", cfg.name(), rowCount,
                System.currentTimeMillis() - start);

        datasetService.upsert(cfg.name(), cfg.destKey(), cfg.description(),
                (long) rowCount, "export");
    }
}
