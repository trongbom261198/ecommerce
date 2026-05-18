package com.ecommerce.common.exception;

import lombok.Getter;

/**
 * Base business exception carrying an HTTP status code and an application error code.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final int httpStatus;
    private final String errorCode;

    public BusinessException(int httpStatus, String errorCode, String message) {
        super(message);
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
    }

    public BusinessException(int httpStatus, String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
    }
}
