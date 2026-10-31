-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_userId_lastMessageAt_idx" ON "assistant_conversations"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "assistant_messages_conversationId_createdAt_idx" ON "assistant_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
