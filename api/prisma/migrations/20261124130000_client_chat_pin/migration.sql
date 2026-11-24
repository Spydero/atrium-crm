-- Optional PIN protection for unused client chat invitations.
ALTER TABLE "ClientChatPass"
  ADD COLUMN "pinDigest" TEXT,
  ADD COLUMN "failedPinAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClientChatPass" ADD CONSTRAINT "ClientChatPass_pin_check"
  CHECK ("failedPinAttempts" BETWEEN 0 AND 4
    AND ("pinDigest" IS NOT NULL OR "failedPinAttempts" = 0)
    AND (NOT "isSession" OR "pinDigest" IS NULL));
