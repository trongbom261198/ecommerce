package com.ecommerce.analyticsservice.pipeline;

import java.util.List;

public record TableExportConfig(String name, String destKey, String whereClause, String description) {

    public static List<TableExportConfig> defaults() {
        return List.of(
                new TableExportConfig("orders", "exports/orders.parquet",
                        "created_at > NOW() - INTERVAL '90 days'", "Đơn hàng 90 ngày gần nhất"),
                new TableExportConfig("order_items", "exports/order_items.parquet",
                        "1=1", "Chi tiết dòng đơn hàng"),
                new TableExportConfig("products", "exports/products.parquet",
                        "deleted_at IS NULL", "Sản phẩm đang hoạt động"),
                new TableExportConfig("users", "exports/users.parquet",
                        "role = 'CUSTOMER'", "Danh sách khách hàng"),
                new TableExportConfig("inventory_items", "exports/inventory_items.parquet",
                        "1=1", "Tồn kho hiện tại")
        );
    }
}
