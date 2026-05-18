package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.ChatRoom;
import com.ecommerce.orderservice.entity.ChatRoomStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {

    Optional<ChatRoom> findByUserIdAndStatus(UUID userId, ChatRoomStatus status);

    Page<ChatRoom> findAllByOrderByUpdatedAtDesc(Pageable pageable);
}
