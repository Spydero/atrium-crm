-- Keep attachment bytes private and linked to their message.
CREATE TABLE "ChatAttachment" (
  "messageId" INTEGER PRIMARY KEY REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  CONSTRAINT "ChatAttachment_size_check" CHECK ("size" BETWEEN 1 AND 10485760 AND "size" = octet_length("content"))
);
