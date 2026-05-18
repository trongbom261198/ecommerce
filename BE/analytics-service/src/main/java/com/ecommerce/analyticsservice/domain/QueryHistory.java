package com.ecommerce.analyticsservice.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "analytics_metadata", name = "query_history",
        indexes = {
            @Index(name = "idx_qh_user_id", columnList = "user_id"),
            @Index(name = "idx_qh_created_at", columnList = "created_at DESC")
        })
@Getter
@Setter
public class QueryHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 10)
    private String language;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String code;

    @Column(name = "row_count")
    private Integer rowCount;

    @Column(name = "exec_ms")
    private Integer execMs;

    @Column(nullable = false, length = 10)
    private String status = "success";

    @Column(name = "error_msg", columnDefinition = "TEXT")
    private String errorMsg;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
