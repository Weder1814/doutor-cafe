var express = require("express");
var cors = require("cors");
var app = express();

// pg opcional - funciona sem banco de dados (usa memória como fallback)
var Pool = null;
try { Pool = require("pg").Pool; } catch(e) { console.log("pg nao instalado — usando memoria. Para instalar: npm install pg"); }

app.use(cors());
app.use(express.json({ limit: "50mb" }));

var MP_TOKEN = process.env.MP_ACCESS_TOKEN;
var BASE_URL = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";

// ── PostgreSQL ──────────────────────────────────────────
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(100) UNIQUE NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      nome VARCHAR(200) NOT NULL,
      celular VARCHAR(20),
      pin VARCHAR(4),
      email VARCHAR(200),
      regiao VARCHAR(100),
      plano VARCHAR(50) DEFAULT 'gratuito',
      plano_id VARCHAR(100),
      analises_usadas INTEGER DEFAULT 0,
      criado_em TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✅ Banco de dados pronto");
}
initDB().catch(function(e){ console.error("DB init erro:", e.message); });

var PLANOS = {
  basico_mensal:  { nome: "Básico Mensal",  valor: 29.90, analises: 150 },
  basico_anual:   { nome: "Básico Anual",   valor: 299.90, analises: 150 },
  pro_mensal:     { nome: "Pro Mensal",     valor: 39.90, analises: 300 },
  pro_anual:      { nome: "Pro Anual",      valor: 399.90, analises: 300 },
  premium_mensal: { nome: "Premium Mensal", valor: 49.90, analises: 450 },
  premium_anual:  { nome: "Premium Anual",  valor: 499.90, analises: 450 }
};

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

app.get("/ping", function(req, res) {
  res.json({ ok: true, ts: Date.now() });
});

// ── CADASTRAR USUÁRIO ────────────────────────────
app.post("/cadastrar-usuario", async function(req, res) {
  var userId = req.body.userId, nome = req.body.nome;
  var celular = req.body.celular || "", cpf = req.body.cpf || "";
  var regiao = req.body.regiao || "", email = req.body.email || "";
  var pin = (req.body.pin || "").replace(/[^0-9]/g, "").substr(0, 4);
  if (!userId || !nome) return res.status(400).json({ erro: "Nome obrigatório." });
  var cpfLimpo = cpf.replace(/[^0-9]/g, "");
  // Salvar na memória sempre (fallback)
  usuariosMemoria[userId] = { userId, cpf: cpfLimpo, nome, celular, pin, email, regiao, plano: "gratuito", analisesUsadas: 0, criadoEm: new Date().toISOString() };
  // Salvar no banco se disponível
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO usuarios (user_id, cpf, nome, celular, pin, email, regiao)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET
           nome=EXCLUDED.nome, celular=EXCLUDED.celular,
           pin=COALESCE(EXCLUDED.pin,usuarios.pin),
           email=EXCLUDED.email, regiao=EXCLUDED.regiao, atualizado_em=NOW()`,
        [userId, cpfLimpo||null, nome, celular, pin||null, email, regiao]
      );
    } catch(e) { console.error("Erro DB cadastrar:", e.message); }
  }
  console.log("✅ Usuário salvo:", nome);
  res.json({ ok: true, userId: userId });
});

// Login pelo CPF — recupera conta em novo dispositivo
app.post("/entrar", async function(req, res) {
  var celular = (req.body.celular || "").replace(/[^0-9]/g, "");
  var pin = (req.body.pin || "").replace(/[^0-9]/g, "");
  if (!celular || celular.length < 10) return res.status(400).json({ erro: "Celular inválido." });
  if (!pin || pin.length !== 4) return res.status(400).json({ erro: "PIN deve ter 4 dígitos." });
  try {
    var r = await pool.query("SELECT * FROM usuarios WHERE celular = $1", [celular]);
    if (r.rows.length === 0) return res.status(404).json({ erro: "Celular não encontrado. Faça o cadastro." });
    var u = r.rows[0];
    if (u.pin && u.pin !== pin) return res.status(401).json({ erro: "PIN incorreto." });
    console.log("✅ Login PIN:", u.nome);
    res.json({
      ok: true, userId: u.user_id, nome: u.nome, celular: u.celular,
      email: u.email, regiao: u.regiao, plano: u.plano,
      planoId: u.plano_id, analisesUsadas: u.analises_usadas
    });
  } catch(e) {
    res.status(500).json({ erro: e.message });
  }
});

// Atualizar análises usadas no servidor
app.post("/incrementar-analise", async function(req, res) {
  var userId = req.body.userId;
  if (!userId) return res.json({ ok: false });
  try {
    await pool.query(
      "UPDATE usuarios SET analises_usadas = analises_usadas + 1, atualizado_em = NOW() WHERE user_id = $1",
      [userId]
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false }); }
});


app.get("/usuarios", async function(req, res) {
  if (req.query.senha !== "doutorcafe2026") return res.status(401).json({ erro: "Não autorizado" });
  try {
    var r = await pool.query("SELECT user_id, nome, celular, cpf, regiao, plano, analises_usadas, criado_em FROM usuarios ORDER BY criado_em DESC");
    res.json({ total: r.rows.length, usuarios: r.rows });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});
app.post("/gerar-pix", function(req, res) {
  var planoId = req.body.plano, userId = req.body.userId;
  var email = req.body.email || "produtor@doutorcafe.app";
  var plano = PLANOS[planoId], nome = req.body.nome || "Produtor Rural", cpf = req.body.cpf || "00000000000";
  if (!plano) return res.status(400).json({ erro: "Plano inválido" });
  var body = {
    transaction_amount: plano.valor, description: plano.nome, payment_method_id: "pix",
    payer: { email: email, first_name: nome.split(' ')[0], last_name: nome.split(' ').slice(1).join(' ') || "Rural", identification: { type: "CPF", number: cpf } },
    metadata: { plano_id: planoId, user_id: userId, analises: plano.analises },
    notification_url: BASE_URL + "/webhook-pagamento"
  };
  fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + MP_TOKEN, "X-Idempotency-Key": userId + "_" + planoId + "_" + Date.now() },
    body: JSON.stringify(body)
  })
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
  var body = {
    items: [{ title: plano.nome, quantity: 1, unit_price: plano.valor, currency_id: "BRL" }], payer: { email: email },
    back_urls: { success: "https://doutor-cafe-app.vercel.app?pagamento=sucesso&plano=" + planoId + "&user=" + userId, failure: "https://doutor-cafe-app.vercel.app?pagamento=falha", pending: "https://doutor-cafe-app.vercel.app?pagamento=pendente" },
    auto_approve: false, notification_url: BASE_URL + "/webhook-pagamento", metadata: { plano_id: planoId, user_id: userId, analises: plano.analises }
  };
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

app.post("/webhook-pagamento", async function(req, res) {
  var data = req.body;
  console.log("Webhook MP:", JSON.stringify(data).substr(0,200));
  if (data && data.type === "payment" && data.data && data.data.id) {
    try {
      var r = await fetch("https://api.mercadopago.com/v1/payments/" + data.data.id, {
        headers: { "Authorization": "Bearer " + MP_TOKEN }
      });
      var pagamento = await r.json();
      if (pagamento.status === "approved") {
        var userId = pagamento.external_reference || pagamento.metadata && pagamento.metadata.user_id;
        var planoKey = pagamento.metadata && pagamento.metadata.plano;
        if (userId && planoKey && PLANOS[planoKey]) {
          await pool.query(
            "UPDATE usuarios SET plano = $1, plano_id = $2, atualizado_em = NOW() WHERE user_id = $3",
            [planoKey, String(pagamento.id), userId]
          );
          console.log("✅ Plano ativado:", planoKey, "para userId:", userId);
        }
      }
    } catch(e) { console.error("Webhook erro:", e.message); }
  }
  res.json({ ok: true });
});
app.get("/plano/:userId", async function(req, res) {
  var userId = req.params.userId;
  try {
    var r = await pool.query("SELECT plano, plano_id, analises_usadas FROM usuarios WHERE user_id = $1", [userId]);
    if (r.rows.length === 0) return res.json({ plano: "gratuito", analisesUsadas: 0 });
    var u = r.rows[0];
    res.json({ plano: u.plano || "gratuito", planoId: u.plano_id, analisesUsadas: u.analises_usadas });
  } catch(e) { res.json({ plano: "gratuito", analisesUsadas: 0 }); }
});
app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var prompt = buildPrompt(regiao, altitude, false);

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
        { type: "text", text: prompt }
      ]}]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    console.log("Diagnostico OK, texto:", txt.substr(0,100));
    var resultado = extrairJSON(txt);
    if (!resultado || !resultado.diagnosticos || resultado.diagnosticos.length === 0) {
      resultado = { diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "baixa",
        visto: "", acao: "Nao foi possivel analisar. Fotografe a folha de perto com boa iluminacao.", fungicidas: [] }] };
    }
    res.json(resultado);
  })
  .catch(function(e) {
    console.error("Erro diagnostico:", e.message);
    res.status(500).json({ erro: e.message });
  });
});


// ── DIAGNÓSTICO JSON (fallback para iOS que não suporta SSE) ─────
app.post("/diagnostico-json", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var prompt = buildPrompt(regiao, altitude, false);
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
      { type: "text", text: prompt }
    ]}]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    if (!resultado || !resultado.diagnosticos || resultado.diagnosticos.length === 0) {
      resultado = { diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "baixa", visto: "", acao: "Nao foi possivel analisar. Tente uma foto mais clara.", fungicidas: [] }] };
    }
    res.json(resultado);
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});


// ── PLANO DE AÇÃO (haiku — rápido) ───────────────
app.post("/plano-acao", function(req, res) {
  var diagnosticos = req.body.diagnosticos || [], regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  if (diagnosticos.length === 0) return res.json({ resumo_geral: "", urgente: "", em_21_dias: "", nutricao: "", resumo: "" });
  var regiaoCtx = regiao ? " Regiao: " + regiao + "." : "";
  var resumoDiags = diagnosticos.map(function(d, i){
    var f = d.fungicidas && d.fungicidas.length > 0 ? d.fungicidas.map(function(f){ return f.nome_comercial || f.nome; }).join(", ") : "sem fungicida";
    return (i+1) + ". " + d.diagnostico + " estagio " + d.estagio + " — produtos: " + f;
  }).join("\n");
  var prompt = "Voce e o Doutor Cafe, agronomista especialista." + regiaoCtx + "\n\nDiagnostico encontrou:\n" + resumoDiags + "\n\n" +
    "1. RESUMO_GERAL: 2-3 frases simples. Nomes populares: helmintosporiose=mancha marrom com aneis, ferrugem=po laranjado embaixo da folha, cercosporiose=pontinhos redondos, deficiencias=falta de nutriente X.\n" +
    "2. PLANO: use nomes comerciais (Folicur, Recop, Cercobin). Dose por hectare e por tanque 20L. Linguagem simples.\n\n" +
    "RESPONDA SOMENTE JSON:\n{\"resumo_geral\":\"frases simples\",\"urgente\":\"o que fazer essa semana com produto dose\",\"em_21_dias\":\"o que fazer em 21 dias\",\"nutricao\":\"correcao nutricional se houver\",\"resumo\":\"frase curta\"}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    res.json(resultado || { resumo_geral: "", urgente: "", em_21_dias: "", nutricao: "", resumo: "" });
  })
  .catch(function(){ res.json({ resumo_geral: "", urgente: "", em_21_dias: "", nutricao: "", resumo: "" }); });
});

// ── DIAGNÓSTICO VÍDEO ────────────────────────────
app.post("/diagnostico-video", function(req, res) {
  var frames = req.body.frames, regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  if (!frames || frames.length === 0) return res.status(400).json({ erro: "Nenhum frame recebido." });
  var prompt = buildPrompt(regiao, altitude, true);
  var content = [];
  frames.forEach(function(frame, i){ content.push({ type: "text", text: "Frame " + (i+1) + ":" }); content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame } }); });
  content.push({ type: "text", text: prompt });
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: content }] })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    res.json(resultado || { diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "baixa", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] });
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── ANÁLISE DE SOLO ──────────────────────────────
app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem } }, { type: "text", text: prompt }] }] })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    res.json(resultado || { acao: "Nao foi possivel ler o laudo. Verifique a foto e tente novamente.", valores: {} });
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── IDENTIFICA DANINHA ───────────────────────────
app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro." + contexto + "\n\n" +
"Analise a imagem e identifique a planta daninha. Use linguagem simples para produtor rural. Sem termos tecnicos.\n\n" +
"PLANTAS DANINHAS DO CAFE:\n" +
"1. PICAO-PRETO (Bidens pilosa): sementes com espinhos, flores amarelas. Solo fertil. PRE: Goal BR 5-6L/ha, Ametrina 800 1,5-2,5kg/ha. POS: Goal BR 6L/ha.\n" +
"2. CAPIM-AMARGOSO (Digitaria insularis): GRAMÍNEA perene em TOUCEIRAS grandes 50-100cm, folhas com pelos brancos nas bordas, sementes pilosas que grudam na roupa, caule achatado. Solo degradado, resistente ao glifosato. ACCase: Fusilade, Verdict Max 0,2-0,4L/ha, Select 240EC 0,45L/ha.\n" +
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): GRAMÍNEA anual em TOUCEIRAS DENSAS rasteiras, folhas CHATAS e largas saindo do centro formando leque, espiga com ramificacoes em formato de pe de galinha. Completamente diferente da Buva. Solo COMPACTADO. POS: ACCase + glifosato. Galigan 240 3L/ha. Controlar com maximo 1 perfilho.\n" +
"4. BUVA/VOADEIRA (Conyza spp.): planta ERETA ate 2m, caule unico vertical, folhas ESTREITAS e COMPRIDAS com bordas levemente serrilhadas, aspecto de espeto para cima, levemente peluda/cinza. NAO e gramínea. Solo com excesso de glifosato — resistente. Controlar OBRIGATORIAMENTE com menos de 25cm pois sementes voam. Galigan 240EC, Heat 700WG, Aurora 400EC, Ally 600WG.\n" +
"5. CARURU (Amaranthus spp.): 20cm-2m. Solo fertil com alto N. Heat 700WG em plantas ate 5cm.\n" +
"6. TIRIRICA (Cyperus rotundus): perene, folhas triangulares. Solo com DRENAGEM RUIM. Glifosato + Diuron Nortox 800WP. Pulverizacao SEQUENCIAL.\n" +
"7. CORDA-DE-VIOLA (Ipomoea spp.): trepadeira ate 3m, flores roxas. Solo fertil e umido. Tolerante ao glifosato. Aurora 400EC, Ally 600WG.\n" +
"8. CAPIM-BRAQUIARIA (Urochloa spp.): ALIADA nas entrelinhas. Problema na linha do cafe. Manter 1 metro de distancia. ACCase para controle.\n" +
"9. POAIA-BRANCA (Richardia brasiliensis): planta rasteira, flores brancas. Solo umido. Goal BR, Ametrina.\n" +
"10. CAPIM-MARMELADA (Urochloa plantaginea): gramínea anual ate 80cm. Solo fertil. ACCase.\n" +
"11. TRAPOERABA (Commelina benghalensis): rasteira, flores azuis. Solo UMIDO. TOLERANTE ao glifosato. 2,4-D, carfentrazina.\n" +
"12. GUANXUMA (Sida spp.): arbusto flores amarelas. Solo DEGRADADO. 2,4-D, metsulfurom.\n" +
"13. ERVA-QUENTE (Spermacoce latifolia): flores brancas. Solo ACIDO. Correcao do pH. Metsulfurom, glifosato.\n" +
"14. CAPIM-DE-BURRO (Cynodon dactylon): gramínea rasteira, estoloes. Solo COMPACTADO. ACCase.\n" +
"15. MARIA-PRETINHA (Solanum americanum): frutos pretos TOXICOS. Solo fertil. Glifosato, 2,4-D.\n\n" +
"ATENCAO - DIFERENCIAR PLANTAS:\\n" +
"BUVA = planta ERETA nao-gramínea folhas ESTREITAS compridas serrilhadas aspecto espeto vertical\\n" +
"CAPIM-PE-DE-GALINHA = gramínea touceiras RASAS folhas chatas em leque\\n" +
"CAPIM-AMARGOSO = gramínea touceiras ALTAS 50-100cm com pelos brancos\\n" +
"TIRIRICA = folha triangular em secao flores marrom\\n\\n" +
"RESPONDA SOMENTE JSON:\n{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo em linguagem simples\",\"acao\":\"o que fazer em linguagem simples\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\",\"produtos\":[{\"nome\":\"nome comercial\",\"dose\":\"quantidade simples ex: 3 litros por hectare ou 60mL por tanque de 20L\",\"momento\":\"quando aplicar\",\"como_usar\":\"instrucao pratica\"}],\"alerta\":\"aviso mais importante\",\"manejo_preventivo\":\"dica para evitar que se espalhe\"}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem } }, { type: "text", text: prompt }] }] })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    if (resultado) {
      if (!resultado.nome) resultado.nome = "Planta nao identificada";
      if (!resultado.produtos) resultado.produtos = [];
      if (!resultado.alerta) resultado.alerta = "";
      if (!resultado.manejo_preventivo) resultado.manejo_preventivo = "";
      res.json(resultado);
    } else {
      res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao foi possivel identificar", acao: "Fotografe mais de perto com boa iluminacao.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
    }
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── EXTRATOR JSON ROBUSTO ─────────────────────────
function extrairJSON(txt) {
  if (!txt) return null;
  // Limpar blocos de codigo
  txt = txt.replace(/```json/gi,"").replace(/```/g,"").trim();
  // Estrategia 1: substring entre primeiro { e ultimo }
  try {
    var ini = txt.indexOf("{"), fim = txt.lastIndexOf("}");
    if (ini > -1 && fim > ini) return JSON.parse(txt.substring(ini, fim + 1));
  } catch(e1) {}
  // Estrategia 2: remover caracteres especiais e tentar novamente
  try {
    var txtLimpo = txt.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
    var ini = txtLimpo.indexOf("{"), fim = txtLimpo.lastIndexOf("}");
    if (ini > -1 && fim > ini) return JSON.parse(txtLimpo.substring(ini, fim + 1));
  } catch(e2) {}
  return null;
}

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
"NAO confunda com cercosporiose (que tem centro BRANCO-ACINZENTADO).\n\n" +

"ATENCAO ESPECIAL — HELMINTOSPORIOSE:\n" +
"helmintosporiose=manchas GRANDES marrom-escuras com HALOS CONCENTRICOS bem definidos e halo amarelo ao redor. Principal causa de DESFOLHA SEVERA no cafe.\n\n" +

"DOENCAS FUNGICAS FOLIARES (verifique TODAS — coexistem frequentemente):\n" +
"ferrugem=pustulas ALARANJADAS face INFERIOR. Manchas cloroticas amarelas face superior correspondentes. A MAIS COMUM. Hemileia vastatrix.\n" +
"cercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO bem definido. Olho de pardo.\n" +
"helmintosporiose=manchas GRANDES marrom-escuras HALOS CONCENTRICOS multiplos halo amarelo extenso. Principal causa desfolha severa.\n" +
"antracnose=lesoes AFUNDADAS pretas bordas irregulares tecido morto afundado. Colletotrichum spp.\n" +
"phoma=manchas NECROTICAS negras irregulares SEM halo FOLHAS NOVAS ponteiros. Causa mumificacao dos chumbinhos.\n" +
"aureolada=bacteriana. manchas pardas centro necrotico HALO AMARELO GRANDE. Seca ponteiros e ramos. Pseudomonas syringae.\n" +
"mancha_manteigosa=manchas ENCHARCADAS OLEOSAS aspecto gorduroso face superior E inferior da folha. Amarelecimento. Causa incerta possivelmente viral. PROBLEMA CRESCENTE nos ultimos 5 anos.\n" +
"corynespora=manchas IRREGULARES marrom-avermelhadas com halo amarelo. SIMILAR a cercosporiose mas MAIORES e mais irregulares. Causa desfolha severa. Confundida frequentemente com cercosporiose.\n" +
"koleroga=FOLHAS CAIDAS presas aos ramos por FIOS DE MICELIO visivel. Folhas mortas nao caem ficam dependuradas. Alta umidade. Pellicularia koleroga.\n" +
"ascochyta=manchas CLARAS centro branco-palido bordas marrons indefinidas nas folhas mais velhas. Menos comum.\n" +
"rizoctoniose=manchas aquosas marrons no caule BASE DA PLANTA junto ao solo. Anelar o caule. Mudas e plantas jovens.\n" +
"roseliniose=PONTUACOES ESCURAS microscopicas no caule. Crescimento MICELIAL ESCURO sob casca. Caule enegrecido. Confundir com fusariose — diferenca: roseliniose tem micelios visiveis externo.\n\n" +
"PRAGAS (verifique TODAS):\n" +
"bicho=TRILHAS SERPENTINAS castanhas dentro da folha. Larva mineira Perileucoptera coffeella.\n" +
"acaro=folha BRONZEADA acinzentada opaca face inferior. Acaro vermelho Oligonychus ilicis.\n" +
"cochonilha=massas BRANCAS algodonosas em ramos e axilas. Pseudococcus spp.\n" +
"cochonilha_raiz=planta com amarelecimento geral sem causa aparente nas folhas. Raizes com massas brancas cerosas. Diagnosticar pelos sintomas aereos: queda producao sem doenca foliar visivel.\n" +
"lagarta=areas DESFOLHADAS com lagartas VIVAS visiveis nas bordas da lesao. Varias especies.\n" +
"broca=FURO CIRCULAR 1-2mm no disco floral ou coroa do FRUTO. Hypothenemus hampei. Nivel controle: 3 pct frutos brocados.\n" +
"nematoide=planta com AMARELECIMENTO GERAL progressivo sem recuperacao. Raizes com GALHAS visivel ao examinar o solo ao redor. Meloidogyne spp. Diagnostico definitivo requer laboratorio mas sintomas aereos sugestivos.\n\n" +

"DEFICIENCIAS NUTRICIONAIS (verifique TODAS — coexistem com doencas):\n" +
"nitrogenio=folha TODA AMARELA UNIFORME folhas velhas.\n" +
"magnesio=nervuras VERDES tecido AMARELO internerval folhas velhas.\n" +
"potassio=QUEIMA bordas e pontas folhas velhas, coloracao palida.\n" +
"ferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\n" +
"calcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\n" +
"boro=folhas NOVAS QUEBRADICAS deformadas.\n" +
"zinco=folhas NOVAS ESTREITAS aspecto roseta.\n" +
"manganes=PONTUACOES cloroticas folhas novas.\n" +
"fosforo=folhas ESCURECIDAS verde-escuro a preto.\n" +
"estresse_hidrico=folha MURCHA bordas secas enroladas.\n" +
"escaldadura=manchas amarelas irregulares excesso de sol.\n\n" +

"SE A IMAGEM MOSTRAR FRUTOS DE CAFE (e nao folhas), analise especificamente:\n\n" +
"CONDICOES DOS FRUTOS:\n" +
"fruto_verde=fruto totalmente verde firme sem lesoes — imaturo saudavel.\n" +
"fruto_maduro=fruto VERMELHO ou AMARELO cereja uniforme brilhante — no ponto ideal de colheita.\n" +
"fruto_passado=fruto ESCURECIDO enrugado seco mumificado que permaneceu na planta apos maturacao.\n\n" +
"DOENCAS E PRAGAS EM FRUTOS (verifique todas):\n" +
"broca=FURO CIRCULAR escuro de 1-2mm no disco floral (base) ou coroa do fruto. Presenca de po escuro. Causer: Hypothenemus hampei. MUITO COMUM.\n" +
"antracnose_fruto=lesoes AFUNDADAS CIRCULARES marrom-escuras a PRETAS com halo escuro na superficie do fruto. Frutos mumificados negros com esporos rosacos/salmonados em condicao umida. Causa Colletotrichum spp.\n" +
"fusariose_fruto=fruto MUMIFICADO marrom-escuro a negro SEM perfuracao de broca. Podridao seca interna. Frutos nao caem facilmente.\n" +
"cercosporiose_fruto=manchas CIRCULARES PEQUENAS cinza-esbranquicadas com halo amarelo nos frutos verdes. Similar ao padrao nas folhas.\n" +
"phoma_fruto=manchas NECROTICAS escuras irregulares nos frutos VERDES JOVENS. Frutos caem prematuramente.\n" +
"acaro_fruto=superficie do fruto BRONZEADA acinzentada opaca. Frutos pequenos deformados. Inspecione com lupa.\n" +
"bicho_mineiro_fruto=galeria serpentina castanha visivel sob a casca em frutos jovens verdes.\n\n" +
"INSTRUCAO ANTI-CONFUSAO FRUTOS:\n" +
"broca x antracnose: broca=FURO circular minusculo. antracnose=lesao AFUNDADA GRANDE sem furo.\n" +
"fruto_passado x fusariose: passado=processo natural secagem. fusariose=infeccao fungica fruto nao madurou.\n\n" +

"PRODUTOS E DOSES:\n" +
"ferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.75 unidade_proporcao:mL intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\n" +
"cercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\n" +
"helmintosporiose: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\n" +
"antracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\n" +
"phoma: Tiofanato Metilico 700WP protetor 1-1,5kg/ha.\n" +
"bicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha proporcao_por_litro:0.1 unidade_proporcao:g intervalo:30.\n" +
"acaro: Abamectina 18EC acaricida 0,5-0,75L/ha proporcao_por_litro:0.5 unidade_proporcao:mL intervalo:21.\n" +
"broca: Clorpirifos 480EC inseticida 1,5-2L/ha proporcao_por_litro:1.75 unidade_proporcao:mL intervalo:30.\n" +
"mancha_manteigosa: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Remover folhas afetadas. Consultar engenheiro agronomo.\n" +
"corynespora: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha intervalo:21. Tiofanato Metilico 700WP 1-1,5kg/ha.\n" +
"koleroga: Mancozeb 800WP 2kg/ha intervalo:21 proporcao_por_litro:2 unidade_proporcao:g. Remover folhas presas aos ramos.\n" +
"rizoctoniose: Controle cultural: solo bem drenado, evitar machucados no coleto. Fungicida preventivo: Tiofanato Metilico 700WP.\n" +
"roseliniose: Remover e queimar plantas afetadas. Evitar reuso do solo. Controle biologico com Trichoderma.\n" +
"lagarta: Bacillus thuringiensis biologico 1-2L/ha. Monitorar nivel de infestacao.\n" +
"cochonilha_raiz: Imidacloprid 700WG 0,3kg/ha via solo. Melhorar drenagem do solo.\n" +
"nematoide: Nao ha controle quimico economico para area ja infestada. Rotacao culturas. Uso de variedades resistentes. Consultar agrónomo para nematicidas.\n\n" +
"antracnose_fruto: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha.\n" +
"fusariose_fruto: remover e destruir frutos mumificados. Tiofanato Metilico 700WP protetor 1-1,5kg/ha intervalo:14.\n" +
"cercosporiose_fruto: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha intervalo:21.\n" +
"fruto_passado: recomendado colheita seletiva imediata para evitar fonte de inoculo.\n\n" +

"INSTRUCOES FINAIS:\n" +
"1. Liste TODOS os problemas encontrados — sem limite.\n" +
"2. Ordene do mais grave para o menos grave.\n" +
"3. Manchas alaranjadas na face inferior = ferrugem OBRIGATORIAMENTE.\n" +
"4. Manchas grandes marrons com halos = helmintosporiose OBRIGATORIAMENTE.\n" +
"5. Deficiencias nutricionais: fungicidas:[].\n" +
"6. NUNCA retorne saudavel se houver qualquer sintoma visivel.\n\n" +

"RESPONDA SOMENTE JSON sem texto antes ou depois:\n" +
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual observado\",\"acao\":\"o que fazer em linguagem simples\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});// ── PostgreSQL (opcional) ───────────────────────────────
var pool = null;
var usuariosMemoria = {};

if (Pool && process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, user_id VARCHAR(100) UNIQUE NOT NULL,
    cpf VARCHAR(14) UNIQUE, nome VARCHAR(200) NOT NULL, celular VARCHAR(20), pin VARCHAR(4),
    email VARCHAR(200), regiao VARCHAR(100), plano VARCHAR(50) DEFAULT 'gratuito',
    plano_id VARCHAR(100), analises_usadas INTEGER DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW()
  )`)
  .then(function(){ console.log("✅ PostgreSQL conectado e tabela pronta"); })
  .catch(function(e){ console.error("DB erro:", e.message); pool = null; });
} else {
  console.log("ℹ️ Sem DATABASE_URL — usando memoria. Adicione PostgreSQL no Railway para persistencia.");
}
