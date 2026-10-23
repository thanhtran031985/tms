ALTER TABLE `tractors` ADD `tare_weight_tons` decimal(6,2);--> statement-breakpoint
ALTER TABLE `consolidated_trips` ADD `allocation_review_required` boolean DEFAULT false NOT NULL;