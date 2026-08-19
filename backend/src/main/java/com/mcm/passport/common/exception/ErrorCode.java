package com.mcm.passport.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용중인 이메일입니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    RESET_TOKEN_INVALID(HttpStatus.BAD_REQUEST, "비밀번호 재설정 토큰이 유효하지 않습니다."),
    INVALID_SERIAL_FORMAT(HttpStatus.BAD_REQUEST, "시리얼 번호 형식이 올바르지 않습니다."),
    SERIAL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "이미 등록된 시리얼입니다."),
    PASSPORT_NOT_FOUND(HttpStatus.NOT_FOUND, "여권을 찾을 수 없습니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    IMAGE_UPLOAD_FAILED(HttpStatus.BAD_GATEWAY, "이미지 업로드에 실패했습니다."),
    DIAGNOSIS_NOT_FOUND(HttpStatus.NOT_FOUND, "진단 기록을 찾을 수 없습니다."),
    CARE_RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "케어 기록을 찾을 수 없습니다."),
    TIMELINE_EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "타임라인 이벤트를 찾을 수 없습니다."),
    NOTIFICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "알림을 찾을 수 없습니다."),
    ACCOUNT_NOT_FOUND(HttpStatus.NOT_FOUND, "계정을 찾을 수 없습니다."),
    INVALID_TRANSFER_CODE_FORMAT(HttpStatus.BAD_REQUEST, "승계 코드 형식이 올바르지 않습니다."),
    TRANSFER_CODE_EXPIRED_OR_USED(HttpStatus.BAD_REQUEST, "승계 코드가 만료되었거나 이미 사용되었습니다."),
    CANNOT_TRANSFER_TO_SELF(HttpStatus.BAD_REQUEST, "자기 자신에게는 승계할 수 없습니다."),
    TRANSFER_CODE_ISSUE_FAILED(HttpStatus.CONFLICT, "코드 발급에 실패했습니다. 다시 시도해주세요."),
    INVALID_CURRENT_PASSWORD(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다."),
    STORE_NOT_FOUND(HttpStatus.NOT_FOUND, "매장을 찾을 수 없습니다."),
    RESERVATION_NOT_FOUND(HttpStatus.NOT_FOUND, "예약을 찾을 수 없습니다."),
    SLOT_ALREADY_BOOKED(HttpStatus.CONFLICT, "이미 예약된 시간입니다."),
    INVALID_SLOT_TIME(HttpStatus.BAD_REQUEST, "매장 영업시간에 맞지 않는 예약 시간입니다."),
    DEFECT_DETECTION_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "하자 탐지 서비스에 연결할 수 없습니다."),
    // 하자 탐지 서버가 4xx로 거절한 경우(예: 업로드가 끊겨 깨진 이미지). 서버 장애가
    // 아니라 입력 문제이므로, 사용자에게 다시 촬영하라고 안내할 수 있어야 한다.
    DIAGNOSIS_IMAGE_UNREADABLE(HttpStatus.BAD_REQUEST, "이미지를 분석할 수 없습니다. 밝은 곳에서 다시 촬영해주세요."),
    // 업로드된 파일이 이미지가 아니거나 전송 중 깨진 경우. 서버 장애가 아니라 입력 문제다.
    INVALID_IMAGE_FILE(HttpStatus.BAD_REQUEST, "이미지 파일을 읽을 수 없습니다. 다시 촬영하거나 다른 사진을 선택해주세요.");

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }
}
