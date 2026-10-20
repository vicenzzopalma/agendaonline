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
export const bookings = sqliteTable("bookings", {
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
}, (table) => [index("booking_room_date").on(table.roomId, table.date)]);
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  started: integer("started").notNull().default(0),
});
