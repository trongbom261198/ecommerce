package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.statemachine.OrderEvent;
import com.ecommerce.orderservice.statemachine.OrderState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

/**
 * Lightweight state-transition service.
 * Encodes all valid order transitions in a static map and evaluates them
 * without a heavy framework dependency that is incompatible with Spring Boot 3.
 */
@Slf4j
@Service
public class OrderStateMachineService {

    private static final Map<OrderState, Map<OrderEvent, OrderState>> TRANSITIONS =
            new EnumMap<>(OrderState.class);

    static {
        put(OrderState.PENDING,     OrderEvent.PAYMENT_CONFIRMED,  OrderState.CONFIRMED);
        put(OrderState.PENDING,     OrderEvent.CANCEL,             OrderState.CANCELLED);
        put(OrderState.CONFIRMED,   OrderEvent.WAREHOUSE_ASSIGNED, OrderState.PROCESSING);
        put(OrderState.CONFIRMED,   OrderEvent.CANCEL,             OrderState.CANCELLED);
        put(OrderState.PROCESSING,  OrderEvent.PICKING_STARTED,    OrderState.PICKING);
        put(OrderState.PROCESSING,  OrderEvent.CANCEL,             OrderState.CANCELLED);
        put(OrderState.PICKING,     OrderEvent.PACKING_DONE,       OrderState.PACKED);
        put(OrderState.PACKED,      OrderEvent.CARRIER_PICKED_UP,  OrderState.SHIPPED);
        put(OrderState.SHIPPED,     OrderEvent.DELIVERY_CONFIRMED, OrderState.DELIVERED);
        put(OrderState.DELIVERED,   OrderEvent.REFUND_APPROVED,    OrderState.REFUNDED);
    }

    private static void put(OrderState from, OrderEvent event, OrderState to) {
        TRANSITIONS.computeIfAbsent(from, k -> new EnumMap<>(OrderEvent.class)).put(event, to);
    }

    /**
     * Returns the next state for the given (currentState, event) pair,
     * or currentState if the transition is not defined (rejected).
     */
    public OrderState sendEvent(UUID orderId, OrderState currentState, OrderEvent event) {
        OrderState nextState = TRANSITIONS
                .getOrDefault(currentState, Map.of())
                .get(event);

        if (nextState == null) {
            log.warn("Order {} rejected event {} at state {}", orderId, event, currentState);
            return currentState;
        }

        log.info("Order {} transition: {} --[{}]--> {}", orderId, currentState, event, nextState);
        return nextState;
    }
}
