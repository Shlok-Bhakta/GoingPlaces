import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
