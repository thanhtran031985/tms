CREATE TABLE `drivers` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`user_id` char(36),
	`full_name` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`national_id_no` varchar(20),
	`license_no` varchar(20),
	`license_class` varchar(10),
	`license_expiry` date,
	`dg_certificate_no` varchar(30),
	`dg_certificate_expiry` date,
	`employment_type` enum('FULL_TIME','CONTRACT') NOT NULL DEFAULT 'FULL_TIME',
	`status` enum('AVAILABLE','ON_DUTY','OFF_DUTY','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_orders` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`tractor_id` char(36),
	`trailer_id` char(36),
	`vendor_id` char(36),
	`type` enum('SCHEDULED','BREAKDOWN','TIRE') NOT NULL,
	`odometer_at` int,
	`planned_start` datetime(3),
	`planned_end` datetime(3),
	`cost` decimal(18,2),
	`currency` char(3) NOT NULL DEFAULT 'VND',
	`status` enum('PLANNED','IN_PROGRESS','DONE','CANCELLED') NOT NULL DEFAULT 'PLANNED',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `maintenance_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_plans` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`tractor_id` char(36),
	`trailer_id` char(36),
	`task_code` varchar(50) NOT NULL,
	`interval_km` int,
	`interval_days` int,
	`last_done_odometer` int,
	`last_done_at` date,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `maintenance_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tractors` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`plate_number` varchar(20) NOT NULL,
	`model` varchar(100),
	`ownership` enum('OWNED','LEASED') NOT NULL DEFAULT 'OWNED',
	`fuel_norm_liters_per_100km` decimal(5,2) NOT NULL,
	`current_odometer` int NOT NULL DEFAULT 0,
	`odometer_updated_at` datetime(3),
	`next_maintenance_odometer` int,
	`registration_expiry` date,
	`insurance_expiry` date,
	`transport_badge_expiry` date,
	`permitted_gross_weight_tons` decimal(6,2),
	`gps_device_id` char(36),
	`status` enum('AVAILABLE','IN_USE','MAINTENANCE','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `tractors_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tractor_plate` UNIQUE(`tenant_id`,`plate_number`)
);
--> statement-breakpoint
CREATE TABLE `trailers` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`plate_number` varchar(20) NOT NULL,
	`trailer_type` enum('20FT','40FT','40FT_COMBO','45FT') NOT NULL,
	`can_carry_twin_20` boolean NOT NULL DEFAULT false,
	`has_genset_power` boolean NOT NULL DEFAULT false,
	`tare_weight_tons` decimal(5,2),
	`max_payload_tons` decimal(5,2) NOT NULL,
	`inspection_expiry` date,
	`current_location_id` char(36),
	`current_location_note` varchar(255),
	`status` enum('AVAILABLE','IN_USE','DROPPED','MAINTENANCE','INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `trailers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_trailer_plate` UNIQUE(`tenant_id`,`plate_number`)
);
--> statement-breakpoint
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_orders` ADD CONSTRAINT `maintenance_orders_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_orders` ADD CONSTRAINT `maintenance_orders_tractor_id_tractors_id_fk` FOREIGN KEY (`tractor_id`) REFERENCES `tractors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_orders` ADD CONSTRAINT `maintenance_orders_trailer_id_trailers_id_fk` FOREIGN KEY (`trailer_id`) REFERENCES `trailers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_orders` ADD CONSTRAINT `maintenance_orders_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_plans` ADD CONSTRAINT `maintenance_plans_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_plans` ADD CONSTRAINT `maintenance_plans_tractor_id_tractors_id_fk` FOREIGN KEY (`tractor_id`) REFERENCES `tractors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_plans` ADD CONSTRAINT `maintenance_plans_trailer_id_trailers_id_fk` FOREIGN KEY (`trailer_id`) REFERENCES `trailers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tractors` ADD CONSTRAINT `tractors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trailers` ADD CONSTRAINT `trailers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trailers` ADD CONSTRAINT `trailers_current_location_id_locations_id_fk` FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;