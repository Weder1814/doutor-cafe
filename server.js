var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

var MP_TOKEN = process.env.MP_ACCESS_TOKEN;
var BASE_URL = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";

var PLANOS = {
  basico_mensal:  { nome: "Doutor Café Básico Mensal",  valor: 32.90,  analises: 120 },
  basico_anual:   { nome: "Doutor Café Básico Anual",   valor: 299.90, analises: 120 },
  pro_mensal:     { nome: "Doutor Café Pro Mensal",     valor: 49.90,  analises: 999999 },
  pro_anual:      { nome: "Doutor Café Pro Anual",      valor: 499.90, analises: 999999 }
};

var usuarios = {};
var cadastros = [];

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

app.post("/cadastrar-usuario", function(req, res) {
  var userId = req.body.userId, nome = req.body.nome, celular = req.body.celular;
  var regiao = req.body.regiao || "", email = req.body.email || "";
  if (!userId || !nome || !celular) return res.status(400).json({ erro: "Nome e celular são obrigatórios." });
  var jaExiste = cadastros.find(function(c){ return c.userId === userId; });
  if (jaExiste) return res.json({ sucesso: true, jaExistia: true, analises_bonus: 10 });
  cadastros.push({ userId, nome, celular, regiao, email, dataCadastro: new Date().toISOString(), analises_bonus: 10 });
  console.log("✅ Novo cadastro:", nome, celular, regiao);
  res.json({ sucesso: true, jaExistia: false, analises_bonus: 10 });
});

app.get("/usuarios", function(req, res) {
  if (req.query.senha !== "doutorcafe2026") return res.status(401).json({ erro: "Acesso negado." });
  res.json({ total: cadastros.length, cadastros: cadastros.map(function(c){ return { nome:c.nome, celular:c.celular, regiao:c.regiao, email:c.email, dataCadastro:c.dataCadastro }; }) });
});

app.post("/gerar-pix", function(req, res) {
  var planoId = req.body.plano, userId = req.body.userId;
  var email = req.body.email || "produtor@doutorcafe.app";
  var plano = PLANOS[planoId], nome = req.body.nome || "Produtor Rural", cpf = req.body.cpf || "00000000000";
  if (!plano) return res.status(400).json({ erro: "Plano inválido" });
  var body = { transaction_amount: plano.valor, description: plano.nome, payment_method_id: "pix",
    payer: { email, first_name: nome.split(' ')[0], last_name: nome.split(' ').slice(1).join(' ') || "Rural", identification: { type: "CPF", number: cpf } },
    metadata: { plano_id: planoId, user_id: userId, analises: plano.analises },
    notification_url: BASE_URL + "/webhook-pagamento" };
  fetch("https://api.mercadopago.com/v1/payments", { method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + MP_TOKEN, "X-Idempotency-Key": userId + "_" + planoId + "_" + Date.now() },
    body: JSON.stringify(body) })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.id && d.point_of_interaction) {
      res.json({ id: d.id, qr_code: d.point_of_interaction.transaction_data.qr_code, qr_code_base64: d.point_of_interaction.transaction_data.qr_code_base64, valor: plano.valor, plano: plano.nome });
    } else {
      console.error("Erro MP PIX:", JSON.stringify(d));
      res.status(500).json({ erro: "Erro ao gerar PIX", detalhe: d.message || d.error, debug: JSON.stringify(d).substring(0,300) });
    }
  }).catch(function(e){ res.status(500).json({ erro: e.message }); });
});

app.post("/criar-assinatura", function(req, res) {
  var planoId = req.body.plano, email = req.body.email || "produtor@doutorcafe.app", userId = req.body.userId, plano = PLANOS[planoId];
  if (!plano) return res.status(400).json({ erro: "Plano inválido" });
  var body = { items: [{ title: plano.nome, quantity: 1, unit_price: plano.valor, currency_id: "BRL" }], payer: { email },
    back_urls: { success: "https://doutor-cafe-app.vercel.app?pagamento=sucesso&plano=" + planoId + "&user=" + userId, failure: "https://doutor-cafe-app.vercel.app?pagamento=falha", pending: "https://doutor-cafe-app.vercel.app?pagamento=pendente" },
    auto_approve: false, notification_url: BASE_URL + "/webhook-pagamento", metadata: { plano_id: planoId, user_id: userId, analises: plano.analises } };
  fetch("https://api.mercadopago.com/checkout/preferences", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + MP_TOKEN }, body: JSON.stringify(body) })
  .then(function(r){ return r.json(); })
  .then(function(d){ if (d.id) res.json({ url: d.init_point, id: d.id }); else res.status(500).json({ erro: "Erro ao criar preferência", detalhe: d.message || d.error }); })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

app.get("/verificar-pix/:paymentId", function(req, res) {
  fetch("https://api.mercadopago.com/v1/payments/" + req.params.paymentId, { headers: { "Authorization": "Bearer " + MP_TOKEN } })
  .then(function(r){ return r.json(); })
  .then(function(p){ res.json({ status: p.status, aprovado: p.status === "approved", plano_id: p.metadata && p.metadata.plano_id, user_id: p.metadata && p.metadata.user_id }); })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

app.post("/webhook-pagamento", function(req, res) {
  var tipo = req.body.type, id = req.body.data && req.body.data.id;
  res.status(200).send("OK");
  if (tipo !== "payment" || !id) return;
  fetch("https://api.mercadopago.com/v1/payments/" + id, { headers: { "Authorization": "Bearer " + MP_TOKEN } })
  .then(function(r){ return r.json(); })
  .then(function(p){
    if (p.status === "approved") {
      var meta = p.metadata || {}, userId = meta.user_id, planoId = meta.plano_id, analises = meta.analises || 120;
      if (userId) { usuarios[userId] = { plano: planoId, analises, dataAssinatura: new Date().toISOString(), paymentId: id }; console.log("✅ Plano liberado:", userId, planoId); }
    }
  }).catch(function(e){ console.error("Webhook erro:", e.message); });
});

app.get("/plano/:userId", function(req, res) {
  var u = usuarios[req.params.userId];
  if (u) res.json({ plano: u.plano, analises: u.analises, dataAssinatura: u.dataAssinatura, ativo: true });
  else res.json({ plano: "gratuito", analises: 20, ativo: false });
});

// ── DIAGNÓSTICO ──────────────────────────────────────
app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var prompt = buildPrompt(regiao, altitude, false);

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{
      role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
        { type: "text", text: prompt }
      ]
    }]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    console.log("Resposta modelo (primeiros 200 chars):", txt.substring(0, 200));

    // Parse robusto — tenta 3 estratégias
    var resultado = null;

    // Estratégia 1: limpar e fazer match
    try {
      var txtLimpo = txt.replace(/```json/gi,"").replace(/```/g,"").trim();
      var inicio = txtLimpo.indexOf("{");
      var fim = txtLimpo.lastIndexOf("}");
      if (inicio > -1 && fim > inicio) {
        resultado = JSON.parse(txtLimpo.substring(inicio, fim + 1));
      }
    } catch(e1) {
      console.error("Estrategia 1 falhou:", e1.message);
    }

    // Estratégia 2: regex greedier
    if (!resultado) {
      try {
        var m = txt.match(/\{"diagnosticos"[\s\S]*\}/);
        if (m) resultado = JSON.parse(m[0]);
      } catch(e2) {
        console.error("Estrategia 2 falhou:", e2.message);
      }
    }

    // Estratégia 3: extrair cada diagnóstico individualmente
    if (!resultado) {
      try {
        var diags = [];
        var matches = txt.match(/\{"diagnostico"[\s\S]*?"fungicidas":\s*\[[\s\S]*?\]\s*\}/g);
        if (matches && matches.length > 0) {
          matches.forEach(function(m){ try { diags.push(JSON.parse(m)); } catch(e){} });
        }
        if (diags.length > 0) resultado = { diagnosticos: diags };
      } catch(e3) {
        console.error("Estrategia 3 falhou:", e3.message);
      }
    }

    if (resultado && resultado.diagnosticos && resultado.diagnosticos.length > 0) {
      console.log("✅ Parse OK:", resultado.diagnosticos.length, "diagnosticos");
      res.json(resultado);
    } else {
      console.error("❌ Parse falhou. Resposta completa:", txt.substring(0, 500));
      res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "baixa", visto: txt.substring(0,100), acao: "Nao foi possivel analisar. Tente uma foto mais clara com boa iluminacao.", fungicidas: [] }] });
    }
  })
  .catch(function(e){
    console.error("Erro fetch diagnostico:", e.message);
    res.status(500).json({ erro: e.message });
  });
});

// ── PLANO DE AÇÃO (chamada separada — haiku) ─────────
app.post("/plano-acao", function(req, res) {
  var diagnosticos = req.body.diagnosticos || [];
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;

  if (diagnosticos.length === 0) return res.json({ urgente: "", em_21_dias: "", nutricao: "", resumo_geral: "", resumo: "" });

  var regiaoCtx = regiao ? " O produtor esta na regiao " + regiao + "." : "";

  var resumoDiags = diagnosticos.map(function(d, i) {
    var fungStr = d.fungicidas && d.fungicidas.length > 0
      ? d.fungicidas.map(function(f){ return f.nome_comercial || f.nome; }).join(", ")
      : "sem fungicida";
    return (i+1) + ". " + d.diagnostico + " (estagio " + d.estagio + "/5, " + d.confianca + " confianca) — produtos: " + fungStr;
  }).join("\n");

  var prompt =
    "Voce e o Doutor Cafe, agronomista especialista." + regiaoCtx + "\n\n" +
    "O diagnostico encontrou:\n" + resumoDiags + "\n\n" +
    "Crie:\n" +
    "1. RESUMO_GERAL: 2-3 frases simples explicando o que o produtor tem. Use nomes populares: " +
    "helmintosporiose=mancha marrom com aneis, ferrugem=po laranjado embaixo da folha, " +
    "cercosporiose=pontinhos redondos, deficiencias=falta de nutriente X.\n" +
    "2. PLANO: consolide tratamentos. Use nomes comerciais (Folicur, Recop, Cercobin). " +
    "Dose por hectare E por tanque de 20L. Linguagem simples.\n\n" +
    "RESPONDA SOMENTE JSON:\n" +
    "{\"resumo_geral\":\"2-3 frases em linguagem simples com nomes populares\",\"urgente\":\"O que fazer ESSA SEMANA com produto dose por hectare e por tanque de 20L\",\"em_21_dias\":\"O que fazer em 21 dias\",\"nutricao\":\"Correcao nutricional se houver deficiencia\",\"resumo\":\"Uma frase curta resumindo\"}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, messages: [{
      role: "user", content: [{ type: "text", text: prompt }]
    }]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var txtLimpo = txt.replace(/```json/g,"").replace(/```/g,"").trim();
    var m = txtLimpo.match(/\{[\s\S]*\}/);
    if (m) {
      try { res.json(JSON.parse(m[0])); }
      catch(e) { res.json({ urgente: "", em_21_dias: "", nutricao: "", resumo_geral: "", resumo: "" }); }
    } else {
      res.json({ urgente: "", em_21_dias: "", nutricao: "", resumo_geral: "", resumo: "" });
    }
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});
// ── DIAGNÓSTICO VÍDEO ──────────────────────────
app.post("/diagnostico-video", function(req, res) {
  var frames = req.body.frames, regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  if (!frames || frames.length === 0) return res.status(400).json({ erro: "Nenhum frame recebido." });
  var prompt = buildPrompt(regiao, altitude, true);
  var content = [];
  frames.forEach(function(frame, i){ content.push({ type: "text", text: "Frame " + (i+1) + " de " + frames.length + ":" }); content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame }}); });
  content.push({ type: "text", text: prompt });
  fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content }]}) })
  .then(function(r){ return r.json(); })
  .then(function(d){ var txt = d.content && d.content[0] ? d.content[0].text : ""; var m = txt.match(/\{[\s\S]*\}/); if (m) res.json(JSON.parse(m[0])); else res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] }); })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── ANÁLISE DE SOLO ──────────────────────────────
app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]}) })
  .then(function(r){ return r.json(); })
  .then(function(d){ var txt = d.content && d.content[0] ? d.content[0].text : ""; var m = txt.match(/\{[\s\S]*\}/); if (m) res.json(JSON.parse(m[0])); else res.json({ acao: "Nao foi possivel ler o laudo. Verifique a foto e tente novamente.", valores: {} }); })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── IDENTIFICA DANINHA ───────────────────────────
app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro." + contexto + "\n\n" +
"Analise a imagem e identifique a planta daninha com precisao. Use o banco de dados abaixo.\n\n" +
"=== PLANTAS DANINHAS DO CAFE ===\n\n" +
"1. PICAO-PRETO (Bidens pilosa): folha larga, sementes com espinhos, flores amarelas. Solo fertil com manejo deficiente. PRE: Goal BR 5-6L/ha, Ametrina 800 1,5-2,5kg/ha. POS: Goal BR 6L/ha. Controlar ANTES do florescimento.\n\n" +
"2. CAPIM-AMARGOSO (Digitaria insularis): gramínea perene 50-100cm, touceiras. Solo degradado com excesso de glifosato. Resistente ao glifosato. ACCase: Fusilade 250EW, Verdict Max 0,2-0,4L/ha, Select 240EC 0,45L/ha, Kennox 0,5-0,7L/ha.\n\n" +
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): gramínea anual 30-50cm. Solo COMPACTADO. POS: ACCase + glifosato. Galigan 240 3L/ha. Controlar com maximo 1 perfilho.\n\n" +
"4. BUVA/VOADEIRA (Conyza spp.): planta ereta ate 2m. Solo com excesso de glifosato. Resistente ao glifosato. Controlar com MENOS de 25cm. Galigan 240EC, Heat 700WG, Aurora 400EC, Ally 600WG.\n\n" +
"5. CARURU (Amaranthus spp.): planta 20cm-2m. Solo fertil com alto N. Hospedeiro de nematoide. Heat 700WG em plantas ate 5cm.\n\n" +
"6. TIRIRICA (Cyperus rotundus): perene 10-60cm, folhas triangulares. Solo com DRENAGEM RUIM. Glifosato + Diuron Nortox 800WP. Pulverizacao SEQUENCIAL.\n\n" +
"7. CORDA-DE-VIOLA (Ipomoea spp.): trepadeira ate 3m, flores roxas. Solo fertil e umido. Tolerante ao glifosato. Aurora 400EC, Ally 600WG. NAO puxar quando nos cafeeiros.\n\n" +
"8. CAPIM-BRAQUIARIA (Urochloa spp.): ALIADA nas entrelinhas. Problema na linha do cafe. Manter 1 metro de distancia. ACCase para controle.\n\n" +
"9. POAIA-BRANCA (Richardia brasiliensis): planta rasteira, flores brancas. Solo umido. Goal BR, Ametrina em pos-emergencia.\n\n" +
"10. CAPIM-MARMELADA (Urochloa plantaginea): gramínea anual ate 80cm. Solo fertil e umido. ACCase em pos-emergencia.\n\n" +
"11. TRAPOERABA (Commelina benghalensis): planta rasteira, flores azuis. Solo UMIDO. TOLERANTE ao glifosato. 2,4-D, carfentrazina.\n\n" +
"12. GUANXUMA (Sida spp.): arbusto flores amarelas. Solo DEGRADADO. 2,4-D, metsulfurom.\n\n" +
"13. ERVA-QUENTE (Spermacoce latifolia): planta ereta, flores brancas. Solo ACIDO. Correcao do pH. Metsulfurom, glifosato.\n\n" +
"14. CAPIM-DE-BURRO (Cynodon dactylon): gramínea rasteira, estoloes. Solo COMPACTADO. ACCase em pos-emergencia.\n\n" +
"15. MARIA-PRETINHA (Solanum americanum): planta 30-80cm, frutos pretos TOXICOS. Solo fertil. Glifosato, 2,4-D.\n\n" +
"INDICADORES: Solo ACIDO=erva-quente,tiririca,capim-pe-de-galinha. Solo COMPACTADO=capim-pe-de-galinha,tiririca,capim-de-burro. Solo FERTIL=picao-preto,caruru,corda-de-viola. Solo UMIDO=tiririca,trapoeraba,poaia-branca. Excesso GLIFOSATO=buva,capim-amargoso.\n\n" +
"Use linguagem simples para produtor rural. Sem termos tecnicos.\n\n" +
"RESPONDA SOMENTE JSON:\n" +
"{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo em linguagem simples\",\"acao\":\"o que fazer agora em linguagem simples\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\",\"produtos\":[{\"nome\":\"nome comercial do produto\",\"dose\":\"quantidade em linguagem simples\",\"momento\":\"quando aplicar\",\"como_usar\":\"instrucao pratica\"}],\"alerta\":\"aviso mais importante em linguagem simples\",\"manejo_preventivo\":\"dica pratica para evitar que se espalhe\"}";

  fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]}) })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var txtLimpo = txt.replace(/```json/g,"").replace(/```/g,"").trim();
    var m = txtLimpo.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        var jsonStr = m[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
        var resultado = JSON.parse(jsonStr);
        if (!resultado.nome) resultado.nome = "Planta nao identificada";
        if (!resultado.indicador) resultado.indicador = "Nao foi possivel determinar indicador";
        if (!resultado.acao) resultado.acao = "Tente uma foto mais proxima e com boa iluminacao.";
        if (!resultado.urgencia) resultado.urgencia = "media";
        if (!resultado.tipo_controle) resultado.tipo_controle = "integrado";
        if (!resultado.produtos) resultado.produtos = [];
        if (!resultado.alerta) resultado.alerta = "";
        if (!resultado.manejo_preventivo) resultado.manejo_preventivo = "";
        res.json(resultado);
      } catch(e) {
        res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Erro ao processar resposta", acao: "Tente uma foto mais clara.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
      }
    } else {
      res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao foi possivel identificar", acao: "Fotografe mais de perto com boa iluminacao.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
    }
  }).catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── BUILD PROMPT ─────────────────────────────────
function buildPrompt(regiao, altitude, isVideo) {
  var contextoRegional = "";
  if (regiao) {
    var deficienciasRegiao = {
      "Cerrado Mineiro": "solos acidos com deficiencia frequente de Calcio Magnesio e Boro. Alta incidencia de ferrugem em anos umidos.",
      "Sul de Minas": "altitudes acima de 800m favorecem Phoma e Cercosporiose. Risco de deficiencia de Zinco.",
      "Mogiana": "regiao quente 22-26C com risco de acaro vermelho e broca em periodos secos. Deficiencia de Potassio comum.",
      "Matas de Minas": "alta umidade favorece ferrugem e bicho-mineiro. Deficiencia de Fosforo e Magnesio.",
      "Chapada Diamantina": "altitude elevada favorece Phoma. Deficiencia de Nitrogenio e Boro.",
      "Planalto da Bahia": "clima seco favorece acaro vermelho. Deficiencia de Ferro em solos alcalinos.",
      "Rondonia": "alta umidade favorece ferrugem antracnose e cercosporiose. Solos acidos.",
      "Norte do Parana": "risco de geadas maio-agosto. Risco de deficiencia de Manganes.",
      "Espirito Santo": "alta umidade favorece cercosporiose e cochonilha.",
      "Alta Paulista": "clima quente e seco favorece acaro vermelho. Deficiencia de Zinco."
    };
    var info = deficienciasRegiao[regiao] || "regiao cafeeira brasileira.";
    contextoRegional = "\n\nCONTEXTO REGIONAL: Produtor na regiao " + regiao + ". " + info;
    if (altitude) {
      contextoRegional += " Altitude: " + altitude + "m.";
      if (altitude > 900) contextoRegional += " Altitude alta: maior risco de Phoma e Cercosporiose.";
      if (altitude < 600) contextoRegional += " Altitude baixa: maior risco de ferrugem acaro vermelho e broca.";
    }
  }

  var introVideo = isVideo ? "Voce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto.\n\n" : "";

  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia." + contextoRegional + "\n\n" + introVideo +

"REGRA MAIS IMPORTANTE: Voce DEVE listar TODOS os problemas visiveis na imagem. Nunca omita um diagnostico por ja ter encontrado outro. Ferrugem, Cercosporiose, Antracnose, Helmintosporiose e deficiencias nutricionais FREQUENTEMENTE ocorrem juntas na mesma folha — liste TODOS. NUNCA diagnostique saudavel se houver qualquer mancha, lesao, descoloracao ou sintoma visivel na folha.\n\n" +

"PRIORIDADE MAXIMA — FERRUGEM (Hemileia vastatrix):\n" +
"A ferrugem e a doenca mais importante e comum do cafe no Brasil. SEMPRE verifique:\n" +
"- Manchas AMARELO-ALARANJADAS arredondadas na face INFERIOR da folha\n" +
"- Po ou pustulas alaranjadas (uredosporos) visiveis na face inferior\n" +
"- Manchas cloroticas amarelas correspondentes na face SUPERIOR\n" +
"Se encontrar QUALQUER sinal alaranjado ou amarelo-ferrugem: DIAGNOSTIQUE como ferrugem.\n" +
"NAO confunda com cercosporiose (que tem centro BRANCO-ACINZENTADO).\n" +
"NAO agrupe ferrugem com cercosporiose — sao doencas distintas.\n\n" +

"ATENCAO ESPECIAL — HELMINTOSPORIOSE:\n" +
"helmintosporiose=manchas GRANDES marrom-escuras com HALOS CONCENTRICOS bem definidos e halo amarelo ao redor. Principal causa de DESFOLHA SEVERA.\n\n" +

"DOENCAS FUNGICAS E PRAGAS (verifique TODAS):\n" +
"ferrugem=pustulas ALARANJADAS face INFERIOR. Manchas amarelas face superior. A MAIS COMUM.\n" +
"cercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\n" +
"helmintosporiose=manchas GRANDES marrom-escuras HALOS CONCENTRICOS halo amarelo. Causa desfolha.\n" +
"antracnose=lesoes AFUNDADAS pretas irregulares.\n" +
"phoma=manchas NECROTICAS sem halo FOLHAS NOVAS no TOPO.\n" +
"aureolada=manchas pardas GRANDES HALO AMARELO GRANDE seca ramos.\n" +
"bicho=TRILHAS SERPENTINAS castanhas dentro da folha.\n" +
"ascochyta=manchas marrons claras bordas irregulares.\n" +
"manteigosa=areas amarelas translucidas entre nervuras.\n" +
"roseliniose=podridao escura ramos e base do caule.\n" +
"fusariose=SECA DA COPA DE CIMA PARA BAIXO.\n" +
"acaro=folha BRONZEADA acinzentada face inferior.\n" +
"cochonilha=massas BRANCAS algodonosas em ramos.\n" +
"broca=FURO CIRCULAR nos frutos.\n\n" +

"DEFICIENCIAS NUTRICIONAIS (verifique TODAS):\n" +
"nitrogenio=folha TODA AMARELA UNIFORME folhas velhas.\n" +
"magnesio=nervuras VERDES tecido AMARELO internerval folhas velhas.\n" +
"potassio=QUEIMA bordas e pontas folhas velhas, coloracao palida.\n" +
"ferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\n" +
"calcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\n" +
"boro=folhas NOVAS QUEBRADICAS deformadas.\n" +
"zinco=folhas NOVAS ESTREITAS aspecto roseta.\n" +
"manganes=PONTUACOES cloroticas folhas novas.\n" +
"fosforo=folhas ESCURECIDAS verde-escuro a preto.\n" +
"enxofre=folhas NOVAS amarelas UNIFORMES.\n" +
"cobre=manchas NECROTICAS folhas NOVAS deformadas.\n" +
"estresse_hidrico=folha MURCHA bordas secas enroladas.\n" +
"escaldadura=manchas amarelas irregulares excesso de sol.\n" +
"fitotoxicidade=manchas necroticas apos aplicacao.\n\n" +

"SE FOR FRUTO:\n" +
"fruto_verde=fruto verde saudavel.\n" +
"fruto_maduro=fruto cereja no ponto ideal.\n" +
"fruto_passado=fruto seco mumificado.\n\n" +

"PRODUTOS E DOSES:\n" +
"ferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.05 unidade_proporcao:L intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\n" +
"cercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\n" +
"helmintosporiose: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\n" +
"antracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\n" +
"phoma: Tiofanato Metilico 700WP protetor 1-1,5kg/ha.\n" +
"bicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha.\n" +
"acaro: Abamectina 18EC acaricida 0,5-0,75L/ha.\n" +
"broca: Clorpirifos 480EC inseticida 1,5-2L/ha.\n\n" +

"INSTRUCOES FINAIS:\n" +
"1. Liste TODOS os problemas — sem limite.\n" +
"2. Ordene do mais grave para o menos grave.\n" +
"3. Manchas alaranjadas = ferrugem OBRIGATORIAMENTE no array.\n" +
"4. Manchas grandes marrons com halos = helmintosporiose OBRIGATORIAMENTE.\n" +
"5. Folha palida clorotica = inclua deficiencia nutricional.\n" +
"6. Deficiencias nutricionais: fungicidas:[].\n" +
"7. NUNCA retorne saudavel se houver qualquer sintoma visivel.\n\n" +

"RESPONDA SOMENTE JSON sem texto antes ou depois:\n" +
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato_da_lista\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual observado na imagem\",\"acao\":\"o que fazer em linguagem simples\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}



app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
