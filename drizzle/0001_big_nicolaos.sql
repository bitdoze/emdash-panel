ALTER TABLE `deployments` ADD `git_url` text;--> statement-breakpoint
ALTER TABLE `deployments` ADD `git_ref` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `source_repo` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `cpu_millicores` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `memory_mb` integer DEFAULT 512 NOT NULL;