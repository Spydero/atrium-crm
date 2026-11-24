-- Allow brokers to issue a single-use invitation without an expiry.
-- Browser sessions must always have a finite expiration.
ALTER TABLE "ClientChatPass" ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "ClientChatPass" ADD CONSTRAINT "ClientChatPass_session_expiry_check"
  CHECK (NOT "isSession" OR "expiresAt" IS NOT NULL);
