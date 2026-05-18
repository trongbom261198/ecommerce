package com.ecommerce.orderservice.email;

public class EmailTemplates {

    public static String orderConfirmedHtml(String orderNumber, String totalAmount) {
        return "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px'>"
            + "<h2 style='color:#1d4ed8'>Đơn hàng đã được xác nhận!</h2>"
            + "<p>Đơn hàng <strong>#" + escape(orderNumber) + "</strong> của bạn đã được đặt thành công.</p>"
            + "<p>Tổng tiền: <strong>" + escape(totalAmount) + " VND</strong></p>"
            + "<p>Chúng tôi sẽ thông báo khi đơn hàng được giao đi. Cảm ơn bạn đã mua sắm!</p>"
            + "</div>";
    }

    public static String orderShippedHtml(String orderNumber, String trackingNumber) {
        String tracking = (trackingNumber != null && !trackingNumber.isBlank())
                ? escape(trackingNumber) : "N/A";
        return "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px'>"
            + "<h2 style='color:#1d4ed8'>Đơn hàng đã được giao đi!</h2>"
            + "<p>Đơn hàng <strong>#" + escape(orderNumber) + "</strong> đã được vận chuyển.</p>"
            + "<p>Mã vận đơn: <strong>" + tracking + "</strong></p>"
            + "<p>Dự kiến giao hàng trong 3-5 ngày làm việc.</p>"
            + "</div>";
    }

    public static String paymentReceiptHtml(String orderNumber, String totalAmount) {
        return "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px'>"
            + "<h2 style='color:#16a34a'>Thanh toán thành công!</h2>"
            + "<p>Đơn hàng <strong>#" + escape(orderNumber) + "</strong> đã được thanh toán.</p>"
            + "<p>Số tiền: <strong>" + escape(totalAmount) + " VND</strong></p>"
            + "<p>Cảm ơn bạn đã mua sắm tại E-Commerce!</p>"
            + "</div>";
    }

    static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
