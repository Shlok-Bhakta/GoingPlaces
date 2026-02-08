import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Gradient colors for trip cards
const COVER_GRADIENTS = [
  ['#E8A68A', '#C45C3E'],
  ['#7BA88E', '#5B8A72'],
  ['#A8B4E0', '#7A8FC9'],
  ['#D4A054', '#B8860B'],
];

function getRandomGradient(): string {
  const randomIndex = Math.floor(Math.random() * COVER_GRADIENTS.length);
  return JSON.stringify(COVER_GRADIENTS[randomIndex]);
}

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
      color: getRandomGradient(), // Store gradient as JSON string
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

export const getMembers = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("tripMembers")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect();
    
    const members = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          ...m,
          user,
        };
      })
    );
    
    return members.filter((m) => m.user !== null);
  },
});

export const addMember = mutation({
  args: {
    tripId: v.id("trips"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("tripMembers", {
      ...args,
      joinedAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    tripId: v.id("trips"),
    status: v.union(
      v.literal("planning"),
      v.literal("booked"),
      v.literal("live"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tripId, {
      status: args.status,
    });
  },
});
