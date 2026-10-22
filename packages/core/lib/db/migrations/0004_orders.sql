CREATE TABLE `order_containers` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`order_id` char(36) NOT NULL,
	`line_no` int NOT NULL,
	`route_id` char(36) NOT NULL,
	`container_no` varchar(11),
	`seal_no` varchar(20),
	`container_type` enum('20DC','40DC','40HC','45HC','20RF','40RF','20OT','40OT','20FR','40FR','20TK') NOT NULL,
	`cargo_weight_tons` decimal(6,2),
	`vgm_tons` decimal(6,2),
	`is_dangerous_goods` boolean NOT NULL DEFAULT false,
	`dg_class` varchar(10),
	`reefer_setpoint_c` decimal(4,1),
	`release_ref_no` varchar(50),
	`port_readiness` enum('PENDING','READY_EDO','READY_EMPTY_RELEASE','HOLD_CUSTOMS','HOLD_LINE') NOT NULL DEFAULT 'PENDING',
	`applied_trip_mode` enum('SINGLE','TWIN_20','COMBINED') NOT NULL DEFAULT 'SINGLE',
	`linked_container_id` char(36),
	`street_turn_approval_ref` varchar(50),
	`dem_free_until` datetime(3),
	`det_free_until` datetime(3),
	`storage_free_until` datetime(3),
	`base_freight_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`freight_tariff_id` char(36),
	`is_manual_price` boolean NOT NULL DEFAULT false,
	`reprice_required` boolean NOT NULL DEFAULT false,
	`allocated_cost_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`is_epod_verified` boolean NOT NULL DEFAULT false,
	`epod_verified_by` char(36),
	`epod_verified_at` datetime(3),
	`status` enum('PENDING','PLANNED','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`cancel_reason` varchar(255),
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `order_containers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_container_line` UNIQUE(`order_id`,`line_no`)
);
--> statement-breakpoint
CREATE TABLE `order_fees` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`order_id` char(36) NOT NULL,
	`order_container_id` char(36),
	`fee_category` enum('REVENUE_SURCHARGE','PASS_THROUGH') NOT NULL,
	`fee_code` varchar(50) NOT NULL,
	`source` enum('TARIFF','DEM_DET_JOB','MANUAL','EXPENSE_REBILL') NOT NULL,
	`source_tariff_id` char(36),
	`source_ref_id` char(36),
	`idempotency_key` varchar(100),
	`quantity` decimal(10,2) NOT NULL DEFAULT '1',
	`amount` decimal(18,2) NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'VND',
	`vat_rate_percent` decimal(5,2),
	`is_approved` boolean NOT NULL DEFAULT false,
	`approved_by` char(36),
	`invoice_id` char(36),
	`reversal_of_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `order_fees_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_fee_idem` UNIQUE(`tenant_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `order_stops` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`order_id` char(36) NOT NULL,
	`order_container_id` char(36) NOT NULL,
	`sequence_no` int NOT NULL,
	`stop_type` enum('PICK_EMPTY','PICK_FULL','STUFFING','UNSTUFFING','PORT_IN','RETURN_EMPTY','DROP_TRAILER','HOOK_TRAILER','STREET_TURN') NOT NULL,
	`location_id` char(36),
	`location_name` varchar(255) NOT NULL,
	`window_start` datetime(3),
	`deadline_time` datetime(3),
	`arrived_at` datetime(3),
	`departed_at` datetime(3),
	`occurred_at` datetime(3),
	`synced_at` datetime(3),
	`time_source` enum('DEVICE','GEOFENCE','MANUAL'),
	`requires_proof` boolean NOT NULL DEFAULT false,
	`is_ai_verified` boolean NOT NULL DEFAULT false,
	`is_human_verified` boolean NOT NULL DEFAULT false,
	`status` enum('PENDING','ARRIVED','COMPLETED','SKIPPED') NOT NULL DEFAULT 'PENDING',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `order_stops_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_stop_seq` UNIQUE(`order_container_id`,`sequence_no`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`order_no` varchar(30) NOT NULL,
	`customer_id` char(36) NOT NULL,
	`order_type` enum('IMPORT','EXPORT','DOMESTIC') NOT NULL,
	`booking_or_bl_no` varchar(50) NOT NULL,
	`shipping_line_id` char(36),
	`vessel_voyage` varchar(100),
	`eta` datetime(3),
	`etd` datetime(3),
	`cut_off_at` datetime(3),
	`customer_ref` varchar(100),
	`route_id` char(36) NOT NULL,
	`cargo_description` varchar(255),
	`container_count` int NOT NULL DEFAULT 0,
	`total_freight_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`total_surcharge_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`total_pass_through_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`total_allocated_cost_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`currency` char(3) NOT NULL DEFAULT 'VND',
	`is_epod_verified` boolean NOT NULL DEFAULT false,
	`status` enum('DRAFT','CONFIRMED','IN_PROGRESS','PARTIALLY_DELIVERED','DELIVERED','RECONCILED','INVOICED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`cancel_reason` varchar(255),
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_no` UNIQUE(`tenant_id`,`order_no`)
);
--> statement-breakpoint
CREATE TABLE `route_stop_templates` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`route_id` char(36) NOT NULL,
	`sequence_no` int NOT NULL,
	`stop_type` enum('PICK_EMPTY','PICK_FULL','STUFFING','UNSTUFFING','PORT_IN','RETURN_EMPTY','DROP_TRAILER','HOOK_TRAILER','STREET_TURN') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `route_stop_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_route_stop_seq` UNIQUE(`route_id`,`sequence_no`)
);
--> statement-breakpoint
ALTER TABLE `order_containers` ADD CONSTRAINT `order_containers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_containers` ADD CONSTRAINT `order_containers_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_containers` ADD CONSTRAINT `order_containers_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_fees` ADD CONSTRAINT `order_fees_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_fees` ADD CONSTRAINT `order_fees_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_fees` ADD CONSTRAINT `order_fees_order_container_id_order_containers_id_fk` FOREIGN KEY (`order_container_id`) REFERENCES `order_containers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_stops` ADD CONSTRAINT `order_stops_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_stops` ADD CONSTRAINT `order_stops_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_stops` ADD CONSTRAINT `order_stops_order_container_id_order_containers_id_fk` FOREIGN KEY (`order_container_id`) REFERENCES `order_containers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_stops` ADD CONSTRAINT `order_stops_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shipping_line_id_shipping_lines_id_fk` FOREIGN KEY (`shipping_line_id`) REFERENCES `shipping_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_stop_templates` ADD CONSTRAINT `route_stop_templates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `route_stop_templates` ADD CONSTRAINT `route_stop_templates_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_oc_order` ON `order_containers` (`tenant_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `idx_oc_container_no` ON `order_containers` (`tenant_id`,`container_no`);--> statement-breakpoint
CREATE INDEX `idx_oc_det` ON `order_containers` (`tenant_id`,`det_free_until`);--> statement-breakpoint
CREATE INDEX `idx_order_booking` ON `orders` (`tenant_id`,`booking_or_bl_no`);--> statement-breakpoint
CREATE INDEX `idx_order_status` ON `orders` (`tenant_id`,`status`);