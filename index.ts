import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Entre na conta." }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Sessão inválida." }, 401);
    const { data: profile } = await sb.from("profiles").select("banned_at").eq("id", user.id).maybeSingle();
    if (profile?.banned_at) return json({ error: "Conta bloqueada." }, 403);
    const { message } = await req.json();
    if (typeof message !== "string" || message.trim().length < 2 || message.length > 3000) return json({ error: "Mensagem inválida." }, 400);
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "IA não configurada." }, 503);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: "Você é o assistente de suporte da NewStore, loja brasileira de produtos digitais, gift cards e recargas. Responda em português brasileiro, com clareza e educação. Nunca peça senha, código de autenticação, número completo de cartão ou segredos. Não prometa reembolsos, entrega ou pagamento sem confirmação. Para cobrança, reembolso ou acesso à conta, explique que um atendente humano deve verificar." }] }, contents: [{ role: "user", parts: [{ text: message.trim() }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 500 } })
    });
    const data = await response.json();
    if (!response.ok) return json({ error: "Serviço de IA indisponível." }, 502);
    const reply = data?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || "").join("") || "Não consegui responder agora.";
    return json({ reply });
  } catch { return json({ error: "Erro interno." }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }