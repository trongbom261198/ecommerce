package com.ecommerce.orderservice.mapper;

import com.ecommerce.orderservice.dto.OrderEventResponse;
import com.ecommerce.orderservice.dto.OrderItemResponse;
import com.ecommerce.orderservice.dto.OrderResponse;
import com.ecommerce.orderservice.dto.OrderSummaryResponse;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.OrderAuditEvent;
import com.ecommerce.orderservice.entity.OrderItem;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.util.List;
import java.util.Map;

@Mapper(componentModel = "spring")
public interface OrderMapper {

    @Mapping(target = "items", source = "items")
    @Mapping(target = "events", source = "events")
    OrderResponse toOrderResponse(Order order);

    @Mapping(target = "itemCount", expression = "java(order.getItems().size())")
    OrderSummaryResponse toOrderSummaryResponse(Order order);

    @Mapping(target = "images", source = "productSnapshot", qualifiedByName = "extractImages")
    OrderItemResponse toOrderItemResponse(OrderItem item);

    OrderEventResponse toOrderEventResponse(OrderAuditEvent event);

    @Named("extractImages")
    @SuppressWarnings("unchecked")
    default List<String> extractImages(Map<String, Object> snapshot) {
        if (snapshot == null) return List.of();
        Object imgs = snapshot.get("images");
        if (imgs instanceof List<?> list) {
            return list.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .toList();
        }
        return List.of();
    }
}
