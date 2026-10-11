# NewStore — loja digital com Supabase

Frontend React + Vite + TypeScript, migrations SQL com RLS, Supabase Auth/Realtime e Edge Functions para checkout Mercado Pago, webhook, suporte Gemini e gestão administrativa.

## Estado real do projeto

Este repositório é uma base funcional, mas **não está pronto para receber clientes/pagamentos em produção até você configurar e testar os serviços externos**. A página mostra produtos de demonstração quando o Supabase não está configurado. Produtos demo não aceitam compra.

Incluído:
- Cadastro e login por e-mail/senha Supabase.
- Catálogo, pesquisa e filtros.
- Painel admin protegido por role no banco.
- CRUD básico de produtos, configurações visuais, clientes/cargos/bloqueio, pedidos, avaliações e dashboard.
- Atualização realtime de produtos e configurações.
- Edge Functions para checkout/preferência do Mercado Pago, webhook com verificação de assinatura, IA Gemini e ações de usuário.
- SQL com tabelas, índices, triggers e políticas RLS.

Limitações que devem ser concluídas/testadas antes de produção:
- O fluxo de suporte atual responde pela IA, mas a interface de ticket/mensagens persistidas precisa ser conectada para suporte humano completo.
- O painel exibe pedidos e avaliações; o processamento real de reembolso precisa de uma Edge Function que chama a API de refund do Mercado Pago, autorização, idempotência e trilha de auditoria. Não marque um reembolso como processado manualmente sem confirmar com o provedor.
- A finalização de compra é por produto individual. Estoque, entrega de códigos digitais e emissão automática não são implementados; defina o processo de fulfillment antes de vender.
- Configure rate limits, CAPTCHA/anti-abuso, SMTP, termos/privacidade, monitoramento e testes de segurança.
- O webhook exige `MERCADOPAGO_WEBHOOK_SECRET`. Confira a documentação do Mercado Pago para o formato/segredo da assinatura e faça teste de ponta a ponta no ambiente de teste.
- O segredo do webhook pode variar conforme a configuração da aplicação. Não desative a verificação em produção.
- O componente de nota só pode inserir avaliação após ticket fechado, mas o formulário simplificado atual não cria/fecha ticket; conectar esse fluxo antes de habilitar avaliações reais.
- Revisar e testar as Edge Functions com a versão do runtime Deno/Supabase do projeto.

## 1. Criar Supabase
1. Crie um projeto em https://supabase.com/.
2. Abra SQL Editor e execute `supabase/migrations/202610110001_newstore.sql`.
3. Em Authentication > Providers, habilite Email e decida se vai exigir confirmação por e-mail. Configure SMTP próprio para produção.
4. Crie uma conta pela tela do site. Em Authentication > Users, copie o UUID dessa conta.
5. No SQL Editor, execute (substituindo o UUID):
   ```sql
   update public.profiles set role = 'admin' where id = 'SEU-UUID-AQUI';
   ```
   Nunca disponibilize um endpoint público para promover o primeiro admin.
6. Em Project Settings > API, copie a Project URL e a chave publishable/anon para `.env`. A chave publishable/anon é pública e depende das políticas RLS. Nunca use `service_role` no frontend.

## 2. Executar localmente
```bash
cp .env.example .env
# edite VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Para compilar:
```bash
npm run build
```

## 3. Deploy de Edge Functions
Instale Supabase CLI, faça login e associe o projeto:
```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy create-checkout
supabase functions deploy mercadopago-webhook --no-verify-jwt
supabase functions deploy support-ai
supabase functions deploy admin-user-action
```

Configure segredos no servidor:
```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=SEU_TOKEN
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=SEU_SEGREDO_WEBHOOK
supabase secrets set GEMINI_API_KEY=SUA_CHAVE_GEMINI
supabase secrets set SITE_URL=https://SEU-DOMINIO
```
As funções Supabase fornecem `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no runtime gerenciado. Confirme no painel de Functions/Secrets antes de produção. Não commite valores reais.

## 4. Mercado Pago
1. Crie uma aplicação no portal de desenvolvedores do Mercado Pago.
2. Comece com credenciais de teste.
3. Configure notificações de pagamento para `https://SEU_PROJETO.supabase.co/functions/v1/mercadopago-webhook`.
4. Configure o segredo de webhook disponibilizado pelo Mercado Pago no Supabase.
5. Teste pagamentos aprovados, pendentes, recusados, repetidos e assinatura inválida. A função consulta a API do Mercado Pago antes de marcar pedido como pago.
6. Só troque para credenciais de produção após validar o fluxo completo. Nunca envie o Access Token ao navegador.

## 5. Gemini
Crie uma API key no Google AI Studio e armazene como segredo `GEMINI_API_KEY`. A função usa o modelo `gemini-2.5-flash`; verifique disponibilidade/cota na sua conta.

## 6. Publicar no GitHub e Vercel
1. Crie um repositório GitHub e envie estes arquivos (não envie `.env`).
2. Na Vercel, importe o repositório.
3. Build command: `npm run build`; output directory: `dist`.
4. Em Project Settings > Environment Variables, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Faça deploy. Cadastre o domínio e HTTPS na Vercel se desejar.
6. Configure `SITE_URL` nos secrets Supabase com a URL de produção e atualize os redirects permitidos em Supabase Authentication > URL Configuration.
7. Repita deploy após cada alteração.

Alternativa Cloudflare Pages: framework Vite, build `npm run build`, output `dist`, mesmas variáveis `VITE_*`.

## Segurança antes de abrir ao público
- Execute testes RLS para cliente A, cliente B, admin e usuário bloqueado.
- Confirme que cliente não consegue alterar `role`, pedidos, preços, estoque ou estado de pagamento via REST.
- Ative MFA para administradores, limite tentativas de login e configure CAPTCHA/rate limiting.
- Não armazene dados de cartão. Use checkout hospedado pelo Mercado Pago.
- Faça backup do banco e defina retenção de logs.
- Adicione Termos de Uso, Política de Privacidade, política de reembolso e canal LGPD.
- Não anuncie entrega automática enquanto códigos/recargas não estiverem integrados e testados.
