package com.ecommerce.common.exception;

/**
 * Thrown when a request conflicts with the current state of the server (HTTP 409).
 */
public class ConflictException extends BusinessException {

    private static final int HTTP_STATUS = 409;
    private static final String DEFAULT_ERROR_CODE = "CONFLICT";

    public ConflictException(String message) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message);
    }

    public ConflictException(String errorCode, String message) {
        super(HTTP_STATUS, errorCode, message);
    }

    public ConflictException(String message, Throwable cause) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message, cause);
    }
}
