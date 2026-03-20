import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const postcode = url.searchParams.get("postcode");

    if (!postcode || !/^\d{4}$/.test(postcode)) {
      return new Response(
        JSON.stringify({ error: "A valid 4-digit postcode is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find all active buyers whose postcodes array contains this postcode
    const { data: buyers, error } = await supabase
      .from("clients")
      .select("id, company_name, postcodes")
      .eq("type", "ppl")
      .eq("status", "active")
      .contains("postcodes", [postcode]);

    if (error) {
      console.error("DB error:", error);
      return new Response(
        JSON.stringify({ error: "Database query failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!buyers || buyers.length === 0) {
      return new Response(
        JSON.stringify({ buyer_name: null, message: "No installer found for this postcode" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Round-robin: pick buyer based on a rotating index stored in app_settings
    let selectedBuyer = buyers[0];

    if (buyers.length > 1) {
      // Get or create the round-robin index for this postcode
      const settingsKey = `rr_postcode_${postcode}`;
      const { data: setting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", settingsKey)
        .single();

      let currentIndex = 0;
      if (setting && setting.value) {
        currentIndex = parseInt(setting.value, 10) || 0;
      }

      // Select the buyer at the current index (wrap around)
      const buyerIndex = currentIndex % buyers.length;
      selectedBuyer = buyers[buyerIndex];

      // Update the index for next time
      const nextIndex = currentIndex + 1;
      await supabase
        .from("app_settings")
        .upsert(
          { key: settingsKey, value: String(nextIndex), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
    }

    return new Response(
      JSON.stringify({
        buyer_name: selectedBuyer.company_name,
        buyer_id: selectedBuyer.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", Connection: "keep-alive" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
