package com.ecommerce.userservice.email;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final MailProperties props;

    @Async
    public void sendHtml(String to, String subject, String htmlBody) {
        if (!props.isEnabled()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(props.getFrom(), props.getFromName());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
            log.info("Email sent to {}: {}", to, subject);
        } catch (Exception e) {
            log.warn("Failed to send email to {}: {}", to, e.getMessage());
        }
    }

    public void sendWelcome(String to, String fullName) {
        sendHtml(to, "Chào mừng bạn đến với E-Commerce!", EmailTemplates.welcomeHtml(fullName));
    }

    public void sendOtp(String to, String otp) {
        sendHtml(to, "Mã OTP đặt lại mật khẩu", EmailTemplates.otpHtml(otp));
    }
}
