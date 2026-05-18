-- Chat rooms (one per user, reused if OPEN)
CREATE TABLE chat_rooms (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN',  -- OPEN|CLOSED
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID         NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_type VARCHAR(10)  NOT NULL,   -- USER|ADMIN|BOT
    sender_id   UUID,                    -- null for BOT
    content     TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Singleton admin config for chatbox
CREATE TABLE chat_config (
    id               SERIAL  PRIMARY KEY,
    bot_enabled      BOOLEAN NOT NULL DEFAULT false,
    welcome_message  TEXT    NOT NULL DEFAULT 'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
    offline_message  TEXT    NOT NULL DEFAULT 'Hiện tại chúng tôi đang offline. Vui lòng để lại tin nhắn.',
    bot_responses    TEXT,   -- JSON array: [{keyword, response}]
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chat_config (bot_enabled, welcome_message, offline_message, bot_responses)
VALUES (false,
        'Xin chào! Chúng tôi có thể giúp gì cho bạn?',
        'Hiện tại chúng tôi đang offline. Vui lòng để lại tin nhắn.',
        '[{"keyword":"giao hàng","response":"Chúng tôi giao hàng toàn quốc trong 3-5 ngày làm việc."},{"keyword":"đổi trả","response":"Chính sách đổi trả trong 7 ngày kể từ ngày nhận hàng."},{"keyword":"giá","response":"Vui lòng xem chi tiết sản phẩm để biết giá cụ thể."},{"keyword":"thanh toán","response":"Chúng tôi hỗ trợ thanh toán COD và chuyển khoản ngân hàng."}]');

CREATE INDEX idx_chat_rooms_user    ON chat_rooms(user_id);
CREATE INDEX idx_chat_rooms_status  ON chat_rooms(status);
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id);
