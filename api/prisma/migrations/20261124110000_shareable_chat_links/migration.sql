-- Keep chat history. Revoke legacy access where the lead email changed under the old rules.
UPDATE "Conversation" c
SET "accessEnabled" = false, "accessVersion" = "accessVersion" + 1
FROM "Lead" l
WHERE c."leadId" = l."id" AND c."accessEnabled"
  AND lower(trim(l."email")) IS DISTINCT FROM c."clientEmail";

-- Replace unused invitations from the old email flow. Active sessions keep their expiry.
DELETE FROM "ClientChatPass" WHERE NOT "isSession";

ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_participants_check";
ALTER TABLE "Conversation" DROP COLUMN "clientEmail";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participants_check" CHECK (
  ("leadId" IS NOT NULL AND "teamAId" IS NULL AND "teamBId" IS NULL)
  OR ("leadId" IS NULL AND "teamAId" IS NOT NULL AND "teamBId" IS NOT NULL AND "teamAId" <> "teamBId")
);
