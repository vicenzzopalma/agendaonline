import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  location: text("location").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  color: text("color").notNull().default("green"),
  active: integer("active").notNull().default(1),
});
export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    roomId: text("room_id").references(() => rooms.id),
    kind: text("kind").notNull().default("meeting"),
    description: text("description").notNull().default(""),
    participants: text("participants").notNull().default(""),
    link: text("link").notNull().default(""),
    ownerId: text("owner_id").notNull(),
    ownerName: text("owner_name").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull().default(0),
    cancelledAt: integer("cancelled_at"),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    lastActorId: text("last_actor_id").notNull().default(""),
    searchText: text("search_text").notNull().default(""),
  },
  (table) => [
    index("booking_room_date").on(table.roomId, table.date),
    index("booking_date_status").on(table.date, table.status),
  ],
);
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  started: integer("started").notNull().default(0),
});

export const bookingHistory = sqliteTable(
  "booking_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: text("booking_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    recordedAt: integer("recorded_at").notNull(),
    snapshot: text("snapshot").notNull(),
  },
  (table) => [
    index("history_booking_date").on(table.bookingId, table.recordedAt),
  ],
);
export const calendarPolicy = sqliteTable("calendar_policy", {
  id: text("id").primaryKey(),
  blockOptional: integer("block_optional").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
  updatedBy: text("updated_by").notNull().default(""),
});
export const holidayOverrides = sqliteTable("holiday_overrides", {
  date: text("date").primaryKey(),
  allowBooking: integer("allow_booking").notNull(),
  note: text("note").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
export const holidayCache = sqliteTable("holiday_cache", {
  year: integer("year").primaryKey(),
  payload: text("payload").notNull(),
  checkedAt: integer("checked_at").notNull(),
  state: text("state").notNull(),
});
export const calendarPolicyHistory = sqliteTable("calendar_policy_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: text("actor_id").notNull(),
  recordedAt: integer("recorded_at").notNull(),
  snapshot: text("snapshot").notNull(),
});
