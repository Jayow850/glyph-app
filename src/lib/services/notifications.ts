import { prisma } from "../prisma";
import { redisPub } from "../redis";
import type { NotificationType } from "@prisma/client";

/**
 * Create notification + push over Redis pub/sub → Socket.io → device.
 * Email delivery is queued (worker reads `email:queue`).
 */
export async function notify(opts: {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  email?: boolean;
}) {
  const rows = await prisma.notification.createManyAndReturn({
    data: opts.userIds.map((userId) => ({
      userId, type: opts.type, title: opts.title, body: opts.body, linkUrl: opts.linkUrl,
    })),
  });
  for (const n of rows) {
    await redisPub.publish(`user:${n.userId}:notify`, JSON.stringify(n));
    if (opts.email) await redisPub.lpush("email:queue", JSON.stringify(n));
  }
}
