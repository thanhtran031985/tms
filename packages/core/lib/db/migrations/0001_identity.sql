CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`actor_user_id` char(36),
	`entity` varchar(50) NOT NULL,
	`entity_id` char(36) NOT NULL,
	`action` varchar(50) NOT NULL,
	`before` json,
	`after` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`tenant_id` char(36) NOT NULL,
	`seq_key` varchar(50) NOT NULL,
	`last_value` int NOT NULL DEFAULT 0,
	CONSTRAINT `number_sequences_tenant_id_seq_key_pk` PRIMARY KEY(`tenant_id`,`seq_key`)
);
--> statement-breakpoint
CREATE TABLE `tenant_memberships` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` enum('OWNER','ADMIN','DISPATCHER','ACCOUNTANT','FLEET_MANAGER','DRIVER','VIEWER') NOT NULL,
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `tenant_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_membership` UNIQUE(`tenant_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`tax_code` varchar(20),
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
	`plan` enum('TRIAL','STANDARD','PRO') NOT NULL DEFAULT 'TRIAL',
	`status` enum('ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
	`settings` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(255),
	`phone` varchar(20),
	`full_name` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`failed_login_count` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`),
	CONSTRAINT `uq_users_phone` UNIQUE(`phone`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `number_sequences` ADD CONSTRAINT `number_sequences_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_memberships` ADD CONSTRAINT `tenant_memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`tenant_id`,`entity`,`entity_id`);