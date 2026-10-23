CREATE TABLE `consolidated_trips` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`trip_code` varchar(50) NOT NULL,
	`trip_mode` enum('SINGLE','TWIN_20','COMBINED') NOT NULL DEFAULT 'SINGLE',
	`route_id` char(36) NOT NULL,
	`planned_start` datetime(3) NOT NULL,
	`planned_end` datetime(3) NOT NULL,
	`actual_start` datetime(3),
	`actual_end` datetime(3),
	`primary_driver_id` char(36),
	`primary_tractor_id` char(36),
	`primary_trailer_id` char(36),
	`total_cost_norm` decimal(18,2) NOT NULL DEFAULT '0.00',
	`total_actual_cost` decimal(18,2) NOT NULL DEFAULT '0.00',
	`allocation_method` enum('COST_NORM_RATIO','REVENUE_RATIO','EQUAL','DISTANCE_RATIO','MANUAL') NOT NULL DEFAULT 'COST_NORM_RATIO',
	`allocation_adjusted_by` char(36),
	`allocation_adjusted_at` datetime(3),
	`cost_locked_at` datetime(3),
	`status` enum('PLANNED','DISPATCHED','IN_TRANSIT','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `consolidated_trips_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_trip_code` UNIQUE(`tenant_id`,`trip_code`)
);
--> statement-breakpoint
CREATE TABLE `dispatch_assignments` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`consolidated_trip_id` char(36),
	`stop_id` char(36) NOT NULL,
	`assignment_type` enum('INTERNAL_FLEET','SUB_CONTRACTOR') NOT NULL DEFAULT 'INTERNAL_FLEET',
	`driver_id` char(36),
	`tractor_id` char(36),
	`trailer_id` char(36),
	`subcontractor_vendor_id` char(36),
	`subcontractor_driver_name` varchar(255),
	`subcontractor_plate` varchar(20),
	`agreed_subcontract_cost` decimal(18,2),
	`planned_start` datetime(3) NOT NULL,
	`planned_end` datetime(3) NOT NULL,
	`completion_percentage` int NOT NULL DEFAULT 100,
	`replaces_assignment_id` char(36),
	`status` enum('ASSIGNED','IN_TRANSIT','COMPLETED','ABORTED_MIDWAY','RESCUE_ASSIGNED','CANCELLED') NOT NULL DEFAULT 'ASSIGNED',
	`dispatched_at` datetime(3) NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `dispatch_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trip_containers` (
	`tenant_id` char(36) NOT NULL,
	`trip_id` char(36) NOT NULL,
	`order_container_id` char(36) NOT NULL,
	`order_id` char(36) NOT NULL,
	`system_ratio` decimal(9,6),
	`system_amount` decimal(18,2),
	`allocation_ratio` decimal(9,6),
	`allocated_amount` decimal(18,2),
	`is_manual_override` boolean NOT NULL DEFAULT false,
	`override_reason` varchar(255),
	CONSTRAINT `trip_containers_trip_id_order_container_id_pk` PRIMARY KEY(`trip_id`,`order_container_id`)
);
--> statement-breakpoint
ALTER TABLE `consolidated_trips` ADD CONSTRAINT `consolidated_trips_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consolidated_trips` ADD CONSTRAINT `consolidated_trips_route_id_routes_id_fk` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_stop_id_order_stops_id_fk` FOREIGN KEY (`stop_id`) REFERENCES `order_stops`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_driver_id_drivers_id_fk` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_tractor_id_tractors_id_fk` FOREIGN KEY (`tractor_id`) REFERENCES `tractors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_trailer_id_trailers_id_fk` FOREIGN KEY (`trailer_id`) REFERENCES `trailers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `dispatch_assignments_subcontractor_vendor_id_vendors_id_fk` FOREIGN KEY (`subcontractor_vendor_id`) REFERENCES `vendors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispatch_assignments` ADD CONSTRAINT `fk_assign_trip` FOREIGN KEY (`consolidated_trip_id`) REFERENCES `consolidated_trips`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trip_containers` ADD CONSTRAINT `trip_containers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trip_containers` ADD CONSTRAINT `trip_containers_trip_id_consolidated_trips_id_fk` FOREIGN KEY (`trip_id`) REFERENCES `consolidated_trips`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trip_containers` ADD CONSTRAINT `trip_containers_order_container_id_order_containers_id_fk` FOREIGN KEY (`order_container_id`) REFERENCES `order_containers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trip_containers` ADD CONSTRAINT `trip_containers_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_assign_driver_time` ON `dispatch_assignments` (`tenant_id`,`driver_id`,`planned_start`,`planned_end`);--> statement-breakpoint
CREATE INDEX `idx_assign_tractor_time` ON `dispatch_assignments` (`tenant_id`,`tractor_id`,`planned_start`,`planned_end`);--> statement-breakpoint
CREATE INDEX `idx_assign_trailer_time` ON `dispatch_assignments` (`tenant_id`,`trailer_id`,`planned_start`,`planned_end`);--> statement-breakpoint
CREATE INDEX `idx_assign_trip` ON `dispatch_assignments` (`tenant_id`,`consolidated_trip_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_containers_oc` ON `trip_containers` (`tenant_id`,`order_container_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_containers_order` ON `trip_containers` (`tenant_id`,`order_id`);