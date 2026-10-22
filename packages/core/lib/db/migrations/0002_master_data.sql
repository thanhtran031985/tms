CREATE TABLE `customers` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`tax_code` varchar(20),
	`billing_address` varchar(500),
	`payment_term_days` int DEFAULT 30,
	`credit_limit` decimal(18,2),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_customer_code` UNIQUE(`tenant_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`code` varchar(50) NOT NULL,
	`type` enum('PORT','DEPOT','WAREHOUSE','FUEL_STATION','GARAGE','PARKING') NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` varchar(500),
	`customer_id` char(36),
	`vendor_id` char(36),
	`lat` decimal(9,6) NOT NULL,
	`lng` decimal(9,6) NOT NULL,
	`geofence_radius_m` int NOT NULL DEFAULT 300,
	`zone` varchar(100),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_location_code` UNIQUE(`tenant_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`route_code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`origin_zone` varchar(100) NOT NULL,
	`destination_zone` varchar(100) NOT NULL,
	`standard_distance_km` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_route_code` UNIQUE(`tenant_id`,`route_code`)
);
--> statement-breakpoint
CREATE TABLE `shipping_lines` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(255) NOT NULL,
	`allows_street_turn` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `shipping_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sl_code` UNIQUE(`tenant_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`tax_code` varchar(20),
	`type` enum('FUEL_STATION','SUB_CONTRACTOR','GARAGE','PORT','DEPOT','TIRE_SUPPLIER') NOT NULL,
	`payment_term_days` int DEFAULT 30,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`deleted_at` datetime(3),
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_vendor_code` UNIQUE(`tenant_id`,`code`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locations` ADD CONSTRAINT `locations_vendor_id_vendors_id_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `routes` ADD CONSTRAINT `routes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipping_lines` ADD CONSTRAINT `shipping_lines_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;