-- Count delivery attempts per recipient.
--
-- A rate limit is TRANSIENT - the message was never sent and the person should
-- be tried again - but it was being written as a permanent FAILED, which burned
-- 52 recipients across two campaigns for a message that never left. Putting
-- them back in the queue needs a counter, or a rail that keeps refusing would
-- retry the same person indefinitely.
ALTER TABLE "whatsapp_campaign_recipients" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
