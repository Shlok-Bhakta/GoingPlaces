import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      firstName: args.firstName,
      lastName: args.lastName,
      avatar: args.avatar,
      createdAt: Date.now(),
    });
  },
});

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("users").order("desc").collect();
  },
});
