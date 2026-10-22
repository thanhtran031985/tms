CREATE TABLE `fee_tariffs` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`route_id` char(36),
	`container_type` enum('20DC','40DC','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR','20TK') NOT NULL,
	`trip_mode` enum('SINGLE','TWIN_20','COMBINED') NOT NULL DEFAULT 'SINGLE',
	`customer_id` char(36),
	`fee_category` enum('COST_NORM','REVENUE_SURCHARGE','PASS_THROUGH') NOT NULL,
	`fee_code` varchar(50) NOT NULL,
	`fee_name` varchar(255) NOT NULL,
	`calc_basis` enum('PER_TRIP','PER_CONTAINER','PER_DAY','PER_KM') NOT NULL DEFAULT 'PER_TRIP',
	`amount` decimal(18,2) NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'VND',
	`vat_rate_percent` decimal(5,2),
	`is_excluded` boolean NOT NULL DEFAULT false,
	`valid_from` date NOT NULL,
	`valid_to` date,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `fee_tariffs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `freight_tariffs` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`route_id` char(36) NOT NULL,
	`container_type` enum('20DC','40DC','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR','20TK') NOT NULL,
	`trip_mode` enum('SINGLE','TWIN_20','COMBINED') NOT NULL DEFAULT 'SINGLE',
	`customer_id` char(36),
	`base_price` decimal(18,2) NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'VND',
	`vat_rate_percent` decimal(5,2) NOT NULL,
	`valid_from` date NOT NULL,
	`valid_to` date,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `freight_tariffs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fee_tariffs` ADD CONSTRAINT `fee_tariffs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_tariffs` ADD CONSTRAINT `fee_tariffs_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_tariffs` ADD CONSTRAINT `fee_tariffs_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freight_tariffs` ADD CONSTRAINT `freight_tariffs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freight_tariffs` ADD CONSTRAINT `freight_tariffs_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freight_tariffs` ADD CONSTRAINT `freight_tariffs_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_fee_4d` ON `fee_tariffs` (`tenant_id`,`route_id`,`container_type`,`trip_mode`,`customer_id`,`fee_code`,`valid_from`);--> statement-breakpoint
CREATE INDEX `idx_freight_4d` ON `freight_tariffs` (`tenant_id`,`route_id`,`container_type`,`trip_mode`,`customer_id`,`valid_from`);