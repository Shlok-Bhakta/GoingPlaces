import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

export const list = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .order("asc")
      .collect();
    
    // Populate user info for each message
    const messagesWithUsers = await Promise.all(
      messages.map(async (message) => {
        if (message.userId) {
          const user = await ctx.db.get(message.userId);
          return {
            ...message,
            user,
          };
        }
        return {
          ...message,
          user: null,
        };
      })
    );
    
    return messagesWithUsers;
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

// AI Assistant Integration
export const sendWithAI = action({
  args: {
    tripId: v.id("trips"),
    userId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // First, send the user's message
    await ctx.runMutation(api.messages.send, {
      tripId: args.tripId,
      userId: args.userId,
      content: args.content,
      isAI: false,
    });
    
    // Get trip context
    const trip = await ctx.runQuery(api.trips.get, { tripId: args.tripId });
    const messages = await ctx.runQuery(api.messages.list, { tripId: args.tripId });
    
    // Check if AI should respond (simple keyword matching for demo)
    const shouldRespond = checkIfAIShouldRespond(args.content, messages.length);
    
    if (shouldRespond && trip) {
      // Call Gemini API (you'll need to add your API key)
      const aiResponse = await generateAIResponse(
        args.content,
        trip,
        messages.slice(-10) // Last 10 messages for context
      );
      
      if (aiResponse) {
        await ctx.runMutation(api.messages.send, {
          tripId: args.tripId,
          userId: undefined,
          content: aiResponse,
          isAI: true,
        });
      }
    }
  },
});

// Helper function to determine if AI should respond
function checkIfAIShouldRespond(content: string, messageCount: number): boolean {
  const lowerContent = content.toLowerCase();
  
  // Keywords that trigger AI response
  const triggerWords = [
    'help', 'plan', 'suggest', 'recommend', 'when', 'where', 
    'how much', 'cost', 'book', 'hotel', 'flight', 'activity',
    'itinerary', 'schedule', 'budget', 'ai', 'assistant'
  ];
  
  // AI responds if triggered by keywords or every ~5 messages
  const hasKeyword = triggerWords.some(word => lowerContent.includes(word));
  const periodicResponse = messageCount > 0 && messageCount % 5 === 0;
  
  return hasKeyword || periodicResponse;
}

// Helper function to generate AI response using Gemini
async function generateAIResponse(
  userMessage: string,
  trip: any,
  recentMessages: any[]
): Promise<string | null> {
  try {
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error("Gemini API key not configured");
      return null;
    }
    
    // Build context for AI
    const conversationHistory = recentMessages
      .map(m => `${m.isAI ? 'AI' : 'User'}: ${m.content}`)
      .join('\n');
    
    const systemPrompt = `You are a helpful AI assistant in a group chat for trip planning. 
You're helping friends plan a trip to ${trip.destination}.
${trip.startDate ? `Trip dates: ${new Date(trip.startDate).toLocaleDateString()} to ${new Date(trip.endDate || trip.startDate).toLocaleDateString()}` : 'Dates not set yet'}
${trip.startingCity ? `Starting from: ${trip.startingCity}` : ''}

Be friendly, concise, and helpful. Provide practical suggestions for planning.
Don't be too formal - you're part of the friend group.
Keep responses under 2-3 sentences unless specifically asked for more detail.

Recent conversation:
${conversationHistory}

User's latest message: ${userMessage}

Your response:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 200,
          }
        })
      }
    );
    
    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      return null;
    }
    
    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return aiText || null;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return null;
  }
}
