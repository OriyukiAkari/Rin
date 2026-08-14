-- v1.0 integrity and rate-limit foundation

UPDATE `feeds`
SET `alias` = NULL
WHERE `alias` IS NOT NULL
  AND `alias` <> ''
  AND `id` NOT IN (
    SELECT MIN(`id`) FROM `feeds` WHERE `alias` IS NOT NULL AND `alias` <> '' GROUP BY `alias`
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feeds_alias_unique` ON `feeds` (`alias`) WHERE `alias` IS NOT NULL AND `alias` <> '';
--> statement-breakpoint

UPDATE `feed_hashtags`
SET `hashtag_id` = (
  SELECT MIN(`canonical`.`id`)
  FROM `hashtags` AS `canonical`
  WHERE `canonical`.`name` = (
    SELECT `duplicate`.`name` FROM `hashtags` AS `duplicate` WHERE `duplicate`.`id` = `feed_hashtags`.`hashtag_id`
  )
);
--> statement-breakpoint
DELETE FROM `feed_hashtags`
WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`) FROM `feed_hashtags` GROUP BY `feed_id`, `hashtag_id`
);
--> statement-breakpoint
DELETE FROM `hashtags`
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `hashtags` GROUP BY `name`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `hashtags_name_unique` ON `hashtags` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `feed_hashtags_pair_unique` ON `feed_hashtags` (`feed_id`, `hashtag_id`);
--> statement-breakpoint

UPDATE `users`
SET `permission` = (
      SELECT MAX(COALESCE(`duplicate`.`permission`, 0))
      FROM `users` AS `duplicate`
      WHERE `duplicate`.`openid` = `users`.`openid`
    ),
    `password` = COALESCE(
      `password`,
      (SELECT `duplicate`.`password` FROM `users` AS `duplicate`
       WHERE `duplicate`.`openid` = `users`.`openid` AND `duplicate`.`password` IS NOT NULL LIMIT 1)
    )
WHERE `id` IN (SELECT MIN(`id`) FROM `users` GROUP BY `openid`);
--> statement-breakpoint
UPDATE `feeds`
SET `uid` = (SELECT MIN(`canonical`.`id`) FROM `users` AS `canonical` WHERE `canonical`.`openid` = (SELECT `duplicate`.`openid` FROM `users` AS `duplicate` WHERE `duplicate`.`id` = `feeds`.`uid`));
--> statement-breakpoint
UPDATE `moments`
SET `uid` = (SELECT MIN(`canonical`.`id`) FROM `users` AS `canonical` WHERE `canonical`.`openid` = (SELECT `duplicate`.`openid` FROM `users` AS `duplicate` WHERE `duplicate`.`id` = `moments`.`uid`));
--> statement-breakpoint
UPDATE `friends`
SET `uid` = (SELECT MIN(`canonical`.`id`) FROM `users` AS `canonical` WHERE `canonical`.`openid` = (SELECT `duplicate`.`openid` FROM `users` AS `duplicate` WHERE `duplicate`.`id` = `friends`.`uid`));
--> statement-breakpoint
UPDATE `comments`
SET `user_id` = (SELECT MIN(`canonical`.`id`) FROM `users` AS `canonical` WHERE `canonical`.`openid` = (SELECT `duplicate`.`openid` FROM `users` AS `duplicate` WHERE `duplicate`.`id` = `comments`.`user_id`))
WHERE `user_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `users`
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `users` GROUP BY `openid`);
--> statement-breakpoint
UPDATE `users`
SET `username` = substr(`username`, 1, 60) || '-rin-' || `id` || '-' || lower(hex(randomblob(6)))
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `users` GROUP BY `username`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_openid_unique` ON `users` (`openid`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `request_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `expires_at` integer NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `request_limits_expires_at_idx` ON `request_limits` (`expires_at`);
--> statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';
