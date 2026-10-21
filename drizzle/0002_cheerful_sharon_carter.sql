CREATE TABLE `agenda_visitors` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`display_name` text DEFAULT 'Visitante' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `organizer_email` text DEFAULT '' NOT NULL;