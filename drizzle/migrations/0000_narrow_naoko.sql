CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`assignee_id` text,
	`status` text DEFAULT '未着手' NOT NULL,
	`due_date` text,
	`resolved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_actions_tenant` ON `actions` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action_type` text NOT NULL,
	`message` text,
	`target_table` text,
	`target_id` text,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `billing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_code` text NOT NULL,
	`name` text NOT NULL,
	`ip_address` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_billing_code_unique` ON `billing_accounts` (`billing_code`);--> statement-breakpoint
CREATE TABLE `call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`year_month` text NOT NULL,
	`call_date` text,
	`phone_number` text,
	`destination_number` text,
	`destination_type` text NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`imported_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_call_logs_tenant_month` ON `call_logs` (`tenant_id`,`year_month`);--> statement-breakpoint
CREATE INDEX `idx_call_logs_source` ON `call_logs` (`source`);--> statement-breakpoint
CREATE TABLE `channel_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`label` text NOT NULL,
	`contract_ch` integer DEFAULT 0 NOT NULL,
	`tenant_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`billing_account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_channel_groups_billing` ON `channel_groups` (`billing_account_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_groups_tenant` ON `channel_groups` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `monthly_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`year_month` text NOT NULL,
	`fixed_seconds` integer DEFAULT 0 NOT NULL,
	`mobile_seconds` integer DEFAULT 0 NOT NULL,
	`raw_cost` real DEFAULT 0 NOT NULL,
	`ip_call_charge` real DEFAULT 0 NOT NULL,
	`fixed_call_charge` real DEFAULT 0 NOT NULL,
	`mobile_call_charge` real DEFAULT 0 NOT NULL,
	`total_pack_price` integer DEFAULT 0 NOT NULL,
	`total_credit` integer DEFAULT 0 NOT NULL,
	`used_credit` real DEFAULT 0 NOT NULL,
	`overage_charge` real DEFAULT 0 NOT NULL,
	`overage_fixed` real DEFAULT 0 NOT NULL,
	`overage_mobile` real DEFAULT 0 NOT NULL,
	`gross_profit` real DEFAULT 0 NOT NULL,
	`sf_status` text DEFAULT '未送信' NOT NULL,
	`sf_sent_at` text,
	`sf_error_message` text,
	`data_source` text,
	`imported_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_monthly_usages_tenant_month` ON `monthly_usages` (`tenant_id`,`year_month`);--> statement-breakpoint
CREATE TABLE `packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sf_product_code` text NOT NULL,
	`price` integer NOT NULL,
	`credit` integer NOT NULL,
	`bonus_rate` real NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `packs_sf_product_code_unique` ON `packs` (`sf_product_code`);--> statement-breakpoint
CREATE TABLE `phone_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_group_id` text NOT NULL,
	`number` text NOT NULL,
	`free_call` text,
	`category` text NOT NULL,
	`contract_status` text DEFAULT '契約中' NOT NULL,
	`apply_date` text,
	`cancel_date` text,
	`ch_control` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`channel_group_id`) REFERENCES `channel_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_numbers_number_unique` ON `phone_numbers` (`number`);--> statement-breakpoint
CREATE INDEX `idx_phone_numbers_channel_group` ON `phone_numbers` (`channel_group_id`);--> statement-breakpoint
CREATE TABLE `tenant_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`allocated_ch` integer DEFAULT 0 NOT NULL,
	`unit_code` text,
	`start_month` text NOT NULL,
	`end_month` text,
	`unit_ch_status` text DEFAULT '不要' NOT NULL,
	`unit_ch_notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`phone_number_id`) REFERENCES `phone_numbers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assignments_tenant` ON `tenant_assignments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_assignments_phone` ON `tenant_assignments` (`phone_number_id`);--> statement-breakpoint
CREATE TABLE `tenant_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_packs_tenant` ON `tenant_packs` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`company_name` text NOT NULL,
	`sf_opportunity_id` text,
	`mf_partner_id` text,
	`assignee_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`retention_until` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);