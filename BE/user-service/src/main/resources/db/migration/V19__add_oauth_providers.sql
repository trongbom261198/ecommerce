CREATE TABLE user_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         VARCHAR(20) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_subject)
);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

-- Backfill existing password users
INSERT INTO user_identities (user_id, provider, provider_subject)
SELECT id, 'PASSWORD', email FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_identities ui WHERE ui.user_id = users.id AND ui.provider = 'PASSWORD'
);

-- Make password_hash optional (Google users won't have one)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
