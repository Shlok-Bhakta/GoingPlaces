import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Generate a 4-character invite code (uppercase letters only)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // No O, I to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate or get invite code for a trip
export const generateInviteLink = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const trip = await ctx.db.get(args.tripId);
    if (!trip) throw new Error("Trip not found");
    
    // If trip already has an invite token, return it
    if (trip.inviteToken) {
      return trip.inviteToken;
    }
    
    // Generate a new unique 4-character code
    let code = generateInviteCode();
    let existing = await ctx.db
      .query("trips")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", code))
      .first();
    
    // Ensure code is unique
    while (existing) {
      code = generateInviteCode();
      existing = await ctx.db
        .query("trips")
        .withIndex("by_invite_token", (q) => q.eq("inviteToken", code))
        .first();
    }
    
    // Save code to trip
    await ctx.db.patch(args.tripId, { inviteToken: code });
    
    return code;
  },
});

// Get trip by invite code (case-insensitive)
export const getTripByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const upperToken = args.token.toUpperCase();
    
    // Try exact match first
    let trip = await ctx.db
      .query("trips")
      .withIndex("by_invite_token", (q) => q.eq("inviteToken", args.token))
      .first();
    
    // If not found, try case-insensitive search
    if (!trip) {
      const allTrips = await ctx.db.query("trips").collect();
      trip = allTrips.find(t => t.inviteToken?.toUpperCase() === upperToken) || null;
    }
    
    return trip;
  },
});

// Join trip via invite token
export const joinTripByToken = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const upperToken = args.token.toUpperCase();
    
    // Find trip by token (case-insensitive)
    const allTrips = await ctx.db.query("trips").collect();
    const trip = allTrips.find(t => t.inviteToken?.toUpperCase() === upperToken);
    
    if (!trip) {
      throw new Error("Invalid invite token");
    }
    
    // Check if user is already a member
    const existingMembership = await ctx.db
      .query("tripMembers")
      .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    
    if (existingMembership) {
      // Already a member, just return the trip ID
      return trip._id;
    }
    
    // Add user as a member
    await ctx.db.insert("tripMembers", {
      tripId: trip._id,
      userId: args.userId,
      role: "member",
      joinedAt: Date.now(),
    });
    
    return trip._id;
  },
});
