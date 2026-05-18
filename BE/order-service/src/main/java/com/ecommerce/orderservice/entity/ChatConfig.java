package com.ecommerce.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "chat_config")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class ChatConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "bot_enabled", nullable = false)
    @Builder.Default
    private boolean botEnabled = false;

    @Column(name = "welcome_message", nullable = false, columnDefinition = "TEXT")
    private String welcomeMessage;

    @Column(name = "offline_message", nullable = false, columnDefinition = "TEXT")
    private String offlineMessage;

    /** JSON array stored as TEXT: [{keyword, response}, ...] */
    @Column(name = "bot_responses", columnDefinition = "TEXT")
    private String botResponses;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
