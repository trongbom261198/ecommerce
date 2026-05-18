package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record StartChatRequest(
        @NotBlank(message = "Vui lòng nhập họ tên")
        @Size(max = 255)
        String contactName,

        @NotBlank(message = "Vui lòng nhập số điện thoại")
        @Pattern(regexp = "^[0-9]{9,11}$", message = "Số điện thoại không hợp lệ")
        String contactPhone
) {}
