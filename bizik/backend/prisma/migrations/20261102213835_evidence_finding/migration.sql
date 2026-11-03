-- AlterTable
ALTER TABLE "ai_recommendations" ADD COLUMN     "evidenceFinding" TEXT,
ADD COLUMN     "evidenceImages" INTEGER,
ADD COLUMN     "evidenceReadAt" TIMESTAMP(3);
