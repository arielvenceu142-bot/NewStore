export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};