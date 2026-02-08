import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// Handle invite link clicks
// URL format: https://your-convex-site.convex.site/invite?token=abc123
http.route({
  path: "/invite",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing invite token" }), 
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    
    // Look up the trip by invite token
    const trip = await ctx.runQuery(api.invites.getTripByToken, { token });
    
    if (!trip) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invite link" }), 
        { 
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    
    // Redirect to app with deep link
    // This will open the app if installed, or fall back to app store
    const appDeepLink = `goingplaces://invite/${token}`;
    const fallbackUrl = `exp://localhost:8081/--/invite/${token}`; // For Expo Go
    
    // Return HTML that redirects to the app
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Join ${trip.name}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #F8F6F2 0%, #E8E4DD 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.1);
              max-width: 400px;
              text-align: center;
            }
            .emoji {
              font-size: 60px;
              margin-bottom: 20px;
            }
            h1 {
              color: #1C1C1E;
              font-size: 28px;
              margin: 0 0 10px 0;
              font-weight: 600;
            }
            p {
              color: #6B6B6F;
              font-size: 16px;
              line-height: 1.5;
              margin: 0 0 30px 0;
            }
            .button {
              display: inline-block;
              background: #C45C3E;
              color: white;
              padding: 16px 32px;
              border-radius: 12px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
              transition: opacity 0.2s;
            }
            .button:hover {
              opacity: 0.9;
            }
            .detail {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #E5E2DD;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              margin: 10px 0;
              font-size: 14px;
            }
            .detail-label {
              color: #8E8E93;
            }
            .detail-value {
              color: #1C1C1E;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">✈️</div>
            <h1>Join ${trip.name}</h1>
            <p>You've been invited to plan a trip to ${trip.destination}</p>
            <a href="${appDeepLink}" class="button" onclick="setTimeout(() => window.location = '${fallbackUrl}', 1500)">
              Open Going Places
            </a>
            <div class="detail">
              <div class="detail-row">
                <span class="detail-label">Destination</span>
                <span class="detail-value">${trip.destination}</span>
              </div>
              ${trip.startDate ? `
              <div class="detail-row">
                <span class="detail-label">Dates</span>
                <span class="detail-value">${new Date(trip.startDate).toLocaleDateString()}</span>
              </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-value">${trip.status}</span>
              </div>
            </div>
          </div>
          <script>
            // Try to open the app immediately
            window.location = '${appDeepLink}';
            // If app doesn't open in 3 seconds, try Expo Go link
            setTimeout(() => {
              if (document.hidden) return; // App opened successfully
              window.location = '${fallbackUrl}';
            }, 3000);
          </script>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { 
          "Content-Type": "text/html",
          "Cache-Control": "no-cache"
        }
      }
    );
  })
});

// API endpoint to get invite link details (JSON response)
http.route({
  path: "/api/invite",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing invite token" }), 
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    
    const trip = await ctx.runQuery(api.invites.getTripByToken, { token });
    
    if (!trip) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invite link" }), 
        { 
          status: 404,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        trip: {
          id: trip._id,
          name: trip.name,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          status: trip.status,
        }
      }), 
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  })
});

export default http;
