import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("messages")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    tripId: v.id("trips"),
    userId: v.optional(v.id("users")),
    content: v.string(),
    isAI: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
