package com.ecommerce.fulfillmentservice.repository;

import com.ecommerce.fulfillmentservice.entity.FulfillmentTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FulfillmentTaskRepository extends JpaRepository<FulfillmentTask, UUID> {

    List<FulfillmentTask> findByStatus(String status);

    List<FulfillmentTask> findByAssignedTo(UUID staffId);
}
