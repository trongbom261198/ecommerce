package com.ecommerce.userservice.email;

public class EmailTemplates {

    public static String welcomeHtml(String fullName) {
        String safeName = escape(fullName);
        return "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px'>"
            + "<h2 style='color:#1d4ed8'>Chào mừng đến với E-Commerce!</h2>"
            + "<p>Xin chào <strong>" + safeName + "</strong>,</p>"
            + "<p>Tài khoản của bạn đã được tạo thành công. Cảm ơn bạn đã đăng ký!</p>"
            + "<p style='color:#6b7280;font-size:14px'>Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email này.</p>"
            + "</div>";
    }

    public static String otpHtml(String otp) {
        return "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px'>"
            + "<h2 style='color:#1d4ed8'>Đặt lại mật khẩu</h2>"
            + "<p>Mã OTP của bạn là:</p>"
            + "<div style='font-size:36px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;padding:20px;"
            + "background:#f0f4ff;border-radius:8px;text-align:center'>"
            + escape(otp) + "</div>"
            + "<p style='color:#6b7280;font-size:14px;margin-top:16px'>Mã này có hiệu lực trong "
            + "<strong>5 phút</strong>. Không chia sẻ mã này với bất kỳ ai.</p>"
            + "</div>";
    }

    static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
