-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "leadId" TEXT,
    "clientEmail" TEXT,
    "accessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRead" (
    "conversationId" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "lastMessageId" INTEGER NOT NULL,

    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("conversationId","readerId")
);

-- CreateTable
CREATE TABLE "ClientChatPass" (
    "hash" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isSession" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientChatPass_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_leadId_key" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_teamBId_idx" ON "Conversation"("organizationId", "teamBId");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_updatedAt_idx" ON "Conversation"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_organizationId_teamAId_teamBId_key" ON "Conversation"("organizationId", "teamAId", "teamBId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_id_idx" ON "ChatMessage"("conversationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_requestId_key" ON "ChatMessage"("conversationId", "requestId");

-- CreateIndex
CREATE INDEX "ClientChatPass_conversationId_expiresAt_idx" ON "ClientChatPass"("conversationId", "expiresAt");


-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatPass" ADD CONSTRAINT "ClientChatPass_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participants_check" CHECK (
  ("leadId" IS NOT NULL AND "clientEmail" IS NOT NULL AND "teamAId" IS NULL AND "teamBId" IS NULL)
  OR ("leadId" IS NULL AND "clientEmail" IS NULL AND "teamAId" IS NOT NULL AND "teamBId" IS NOT NULL AND "teamAId" <> "teamBId")
);
