UPDATE `users` SET `password` = NULL WHERE `password` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `auth_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `info` SET `value` = '12' WHERE `key` = 'migration_version';
