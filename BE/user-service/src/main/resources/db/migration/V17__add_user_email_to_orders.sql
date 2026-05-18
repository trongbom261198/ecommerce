-- Phase 01: store user email on order for async shipped/notification emails
-- without requiring a cross-service lookup at notification time
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
