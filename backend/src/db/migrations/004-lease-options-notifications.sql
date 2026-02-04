-- Migration: Add lease options and notification fields
-- Date: 2026-01-22

-- Add options field for lease renewal options (e.g., "One (1) Five (5) Yr Option")
ALTER TABLE lease_comp
ADD COLUMN IF NOT EXISTS lease_options VARCHAR(500);

-- Add notification settings for lease expiration reminders
-- notification_months: array of months before expiration to send reminders (e.g., [12, 6, 3, 1])
ALTER TABLE lease_comp
ADD COLUMN IF NOT EXISTS notification_months INTEGER[];

-- Add notification enabled flag
ALTER TABLE lease_comp
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT false;

-- Add last notification sent date
ALTER TABLE lease_comp
ADD COLUMN IF NOT EXISTS last_notification_date DATE;

-- Create index for finding upcoming lease expirations
CREATE INDEX IF NOT EXISTS idx_lease_comp_expiration ON lease_comp(lease_expiration) WHERE lease_expiration IS NOT NULL;

-- Comments
COMMENT ON COLUMN lease_comp.lease_options IS 'Renewal options text, e.g., "One (1) Five (5) Yr Option"';
COMMENT ON COLUMN lease_comp.notification_months IS 'Array of months before expiration to send reminders';
COMMENT ON COLUMN lease_comp.notifications_enabled IS 'Whether expiration notifications are enabled for this lease';
COMMENT ON COLUMN lease_comp.last_notification_date IS 'Date of last notification sent';
