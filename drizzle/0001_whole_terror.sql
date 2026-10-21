CREATE TABLE `booking_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_policy` (
	`id` text PRIMARY KEY NOT NULL,
	`block_optional` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_policy_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holiday_cache` (
	`year` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`checked_at` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holiday_overrides` (
	`date` text PRIMARY KEY NOT NULL,
	`allow_booking` integer NOT NULL,
	`note` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `last_actor_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `search_text` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX booking_date_status ON bookings(date,status);
--> statement-breakpoint
CREATE INDEX history_booking_date ON booking_history(booking_id,recorded_at);
--> statement-breakpoint
DROP TRIGGER booking_conflict_insert;
--> statement-breakpoint
DROP TRIGGER booking_conflict_update;
--> statement-breakpoint
CREATE TRIGGER booking_conflict_insert BEFORE INSERT ON bookings WHEN NEW.room_id IS NOT NULL AND NEW.status='active' BEGIN
    SELECT RAISE(ABORT,'ROOM_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND active=1);
    SELECT RAISE(ABORT,'ROOM_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings WHERE room_id=NEW.room_id AND date=NEW.date AND start<NEW.end AND end>NEW.start AND status='active');
  END;
--> statement-breakpoint
CREATE TRIGGER booking_conflict_update BEFORE UPDATE OF room_id,date,start,end,status ON bookings WHEN NEW.room_id IS NOT NULL AND NEW.status='active' BEGIN
    SELECT RAISE(ABORT,'ROOM_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND active=1);
    SELECT RAISE(ABORT,'ROOM_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings WHERE id<>NEW.id AND room_id=NEW.room_id AND date=NEW.date AND start<NEW.end AND end>NEW.start AND status='active');
  END;
--> statement-breakpoint
CREATE TRIGGER booking_audit_insert AFTER INSERT ON bookings BEGIN INSERT INTO booking_history(booking_id,action,actor_id,recorded_at,snapshot) VALUES(NEW.id,'created',COALESCE(NULLIF(NEW.last_actor_id,''),NEW.owner_id),MAX(NEW.updated_at,NEW.created_at),json_object('id',NEW.id,'title',NEW.title,'date',NEW.date,'start',NEW.start,'end',NEW.end,'room_id',NEW.room_id,'kind',NEW.kind,'description',NEW.description,'participants',NEW.participants,'link',NEW.link,'owner_id',NEW.owner_id,'owner_name',NEW.owner_name,'created_at',NEW.created_at,'updated_at',NEW.updated_at,'cancelled_at',NEW.cancelled_at,'status',NEW.status,'version',NEW.version)); END;
--> statement-breakpoint
CREATE TRIGGER booking_audit_update AFTER UPDATE ON bookings BEGIN INSERT INTO booking_history(booking_id,action,actor_id,recorded_at,snapshot) VALUES(NEW.id,CASE WHEN NEW.status='cancelled' AND OLD.status<>'cancelled' THEN 'cancelled' WHEN OLD.updated_at=0 AND OLD.last_actor_id='' AND NEW.updated_at=NEW.created_at THEN 'imported' ELSE 'updated' END,COALESCE(NULLIF(NEW.last_actor_id,''),NEW.owner_id),NEW.updated_at,json_object('id',NEW.id,'title',NEW.title,'date',NEW.date,'start',NEW.start,'end',NEW.end,'room_id',NEW.room_id,'kind',NEW.kind,'description',NEW.description,'participants',NEW.participants,'link',NEW.link,'owner_id',NEW.owner_id,'owner_name',NEW.owner_name,'created_at',NEW.created_at,'updated_at',NEW.updated_at,'cancelled_at',NEW.cancelled_at,'status',NEW.status,'version',NEW.version)); END;
--> statement-breakpoint
CREATE TRIGGER booking_no_delete BEFORE DELETE ON bookings BEGIN SELECT RAISE(ABORT,'HISTORY_PERMANENT'); END;
--> statement-breakpoint
CREATE TRIGGER booking_history_no_update BEFORE UPDATE ON booking_history BEGIN SELECT RAISE(ABORT,'HISTORY_PERMANENT'); END;
--> statement-breakpoint
CREATE TRIGGER booking_history_no_delete BEFORE DELETE ON booking_history BEGIN SELECT RAISE(ABORT,'HISTORY_PERMANENT'); END;
