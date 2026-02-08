import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    avatar: v.optional(v.string()),
    createdAt: v.number(),
  }),

  trips: defineTable({
    name: v.string(),
    destination: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    startingCity: v.optional(v.string()),
    status: v.union(
      v.literal("planning"),
      v.literal("booked"),
      v.literal("live"),
      v.literal("done")
    ),
    coverImage: v.optional(v.string()),
    color: v.optional(v.string()), // Gradient color for trip card
    createdBy: v.id("users"),
    createdAt: v.number(),
    inviteToken: v.optional(v.string()), // Unique token for invite links
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_invite_token", ["inviteToken"]),

  tripMembers: defineTable({
    tripId: v.id("trips"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_trip", ["tripId"])
    .index("by_user", ["userId"]),

  messages: defineTable({
    tripId: v.id("trips"),
    userId: v.optional(v.id("users")),
    content: v.string(),
    isAI: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_trip", ["tripId", "createdAt"]),
});
