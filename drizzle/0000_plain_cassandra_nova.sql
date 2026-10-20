CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`room_id` text,
	`kind` text DEFAULT 'meeting' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`participants` text DEFAULT '' NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_room_date` ON `bookings` (`room_id`,`date`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'green' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`started` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER booking_conflict_insert BEFORE INSERT ON bookings
WHEN NEW.room_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'ROOM_INACTIVE') WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id=NEW.room_id AND active=1);
  SELECT RAISE(ABORT, 'ROOM_CONFLICT') WHERE EXISTS (SELECT 1 FROM bookings WHERE room_id=NEW.room_id AND date=NEW.date AND start<NEW.end AND end>NEW.start);
END;
--> statement-breakpoint
CREATE TRIGGER booking_conflict_update BEFORE UPDATE OF room_id,date,start,end ON bookings
WHEN NEW.room_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'ROOM_INACTIVE') WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id=NEW.room_id AND active=1);
  SELECT RAISE(ABORT, 'ROOM_CONFLICT') WHERE EXISTS (SELECT 1 FROM bookings WHERE id<>NEW.id AND room_id=NEW.room_id AND date=NEW.date AND start<NEW.end AND end>NEW.start);
END;
