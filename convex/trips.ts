import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
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
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const tripId = await ctx.db.insert("trips", {
      ...args,
      createdAt: Date.now(),
    });
    await ctx.db.insert("tripMembers", {
      tripId,
      userId: args.createdBy,
      role: "admin",
      joinedAt: Date.now(),
    });
    return tripId;
  },
});

export const list = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const memberships = await ctx.db
      .query("tripMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .collect();
    const trips = await Promise.all(
      memberships.map((m) => ctx.db.get(m.tripId))
    );
    return trips.filter(Boolean).sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
  },
});

export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.tripId);
  },
});
