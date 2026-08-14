import { isQueueTask, FEED_AI_SUMMARY_TASK } from "../queue";
import { processFeedAISummaryTask } from "../services/feed-ai-summary";
import { clearFeedCache } from "../services/clear-feed-cache";
import { createRuntimeServices } from "../core/runtime-services";

export async function handleQueue(
  batch: MessageBatch<unknown>,
  env: Env,
  _ctx: ExecutionContext,
) {
  const { db, cache, serverConfig } = createRuntimeServices(env);

  for (const message of batch.messages) {
    const body = message.body;
    if (!isQueueTask(body)) {
      console.warn("Discarding invalid queue message");
      message.ack();
      continue;
    }

    try {
      switch (body.type) {
        case FEED_AI_SUMMARY_TASK:
          await processFeedAISummaryTask(
            env,
            db,
            cache,
            serverConfig,
            body.payload,
            clearFeedCache,
          );
          message.ack();
          break;
        default:
          message.ack();
          break;
      }
    } catch (error) {
      console.error("Queue task failed; retry requested", error);
      message.retry();
    }
  }
}
