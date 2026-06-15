var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

var MP_TOKEN = process.env.MP_ACCESS_TOKEN;
var BASE_URL = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";

// ── PLANOS ──────────────────────────────────────
var PLANOS = {
  basico_mensal:  { nome: "Doutor Café Básico Mensal",  valor: 32.90,  analises: 120 },
  basico_anual:   { nome: "Doutor Café Básico Anual",   valor: 299.90, analises: 120 },
  pro_mensal:     { nome: "Doutor Café Pro Mensal",     valor: 49.90,  analises: 999999 },
  pro_anual:      { nome: "Doutor Café Pro Anual",      valor: 499.90, analises: 999999 }
};

// ── BANCO DE DADOS EM MEMÓRIA ────────────────────
// Em produção migrar para PostgreSQL
var usuarios = {};
var cadastros = [];

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

// ── CADASTRAR USUÁRIO ────────────────────────────
app.post("/cadastrar-usuario", function(req, res) {
  var userId   = req.body.userId;
  var nome     = req.body.nome;
  var celular  = req.body.celular;
  var regiao   = req.body.regiao || "";
  var email    = req.body.email  || "";

  if (!userId || !nome || !celular) {
    return res.status(400).json({ erro: "Nome e celular são obrigatórios." });
  }

  // Verifica se já existe cadastro para esse userId
  var jaExiste = cadastros.find(function(c){ return c.userId === userId; });
  if (jaExiste) {
    return res.json({ sucesso: true, jaExistia: true, analises_bonus: 10 });
  }

  var cadastro = {
    userId:      userId,
    nome:        nome,
    celular:     celular,
    regiao:      regiao,
    email:       email,
    dataCadastro: new Date().toISOString(),
    analises_bonus: 10
  };

  cadastros.push(cadastro);
  console.log("✅ Novo cadastro:", nome, celular, regiao);

  res.json({ sucesso: true, jaExistia: false, analises_bonus: 10 });
});

// ── LISTAR USUÁRIOS (painel admin) ───────────────
app.get("/usuarios", function(req, res) {
  var senha = req.query.senha;
  if (senha !== "doutorcafe2026") {
    return res.status(401).json({ erro: "Acesso negado." });
  }
  res.json({
    total: cadastros.length,
    cadastros: cadastros.map(function(c) {
      return {
        nome:        c.nome,
        celular:     c.celular,
        regiao:      c.regiao,
        email:       c.email,
        dataCadastro: c.dataCadastro
      };
    })
  });
});

// ── GERAR PIX DINÂMICO ───────────────────────────
app.post("/gerar-pix", function(req, res) {
  var planoId = req.body.plano;
  var userId  = req.body.userId;
  var email   = req.body.email || "produtor@doutorcafe.app";
  var plano   = PLANOS[planoId];
  var nome    = req.body.nome || "Produtor Rural";
  var cpf     = req.body.cpf  || "00000000000";

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    transaction_amount: plano.valor,
    description: plano.nome,
    payment_method_id: "pix",
    payer: {
      email: email,
      first_name: nome ? nome.split(' ')[0] : "Produtor",
      last_name:  nome ? nome.split(' ').slice(1).join(' ') || "Rural" : "Rural",
      identification: { type: "CPF", number: cpf || "00000000000" }
    },
    metadata: { plano_id: planoId, user_id: userId, analises: plano.analises },
    notification_url: BASE_URL + "/webhook-pagamento"
  };

  fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + MP_TOKEN,
      "X-Idempotency-Key": userId + "_" + planoId + "_" + Date.now()
    },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.id && d.point_of_interaction) {
      res.json({
        id: d.id,
        qr_code: d.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: d.point_of_interaction.transaction_data.qr_code_base64,
        valor: plano.valor,
        plano: plano.nome
      });
    } else {
      console.error("Erro MP PIX:", JSON.stringify(d));
      res.status(500).json({ erro: "Erro ao gerar PIX", detalhe: d.message || d.error });
    }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── CRIAR PREFERÊNCIA (CARTÃO) ───────────────────
app.post("/criar-assinatura", function(req, res) {
  var planoId = req.body.plano;
  var email   = req.body.email || "produtor@doutorcafe.app";
  var userId  = req.body.userId;
  var plano   = PLANOS[planoId];

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    items: [{ title: plano.nome, quantity: 1, unit_price: plano.valor, currency_id: "BRL" }],
    payer: { email: email },
    back_urls: {
      success: "https://doutor-cafe-app.vercel.app?pagamento=sucesso&plano=" + planoId + "&user=" + userId,
      failure: "https://doutor-cafe-app.vercel.app?pagamento=falha",
      pending: "https://doutor-cafe-app.vercel.app?pagamento=pendente"
    },
    auto_approve: false,
    notification_url: BASE_URL + "/webhook-pagamento",
    metadata: { plano_id: planoId, user_id: userId, analises: plano.analises }
  };

  fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + MP_TOKEN },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.id) { res.json({ url: d.init_point, id: d.id }); }
    else { console.error("Erro MP Cartão:", JSON.stringify(d)); res.status(500).json({ erro: "Erro ao criar preferência", detalhe: d.message || d.error }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── VERIFICAR STATUS DO PIX ──────────────────────
app.get("/verificar-pix/:paymentId", function(req, res) {
  var paymentId = req.params.paymentId;
  fetch("https://api.mercadopago.com/v1/payments/" + paymentId, {
    headers: { "Authorization": "Bearer " + MP_TOKEN }
  })
  .then(function(r) { return r.json(); })
  .then(function(p) {
    res.json({ status: p.status, aprovado: p.status === "approved", plano_id: p.metadata && p.metadata.plano_id, user_id: p.metadata && p.metadata.user_id });
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── WEBHOOK MERCADO PAGO ─────────────────────────
app.post("/webhook-pagamento", function(req, res) {
  var tipo = req.body.type;
  var id   = req.body.data && req.body.data.id;
  res.status(200).send("OK");
  if (tipo !== "payment" || !id) return;
  fetch("https://api.mercadopago.com/v1/payments/" + id, {
    headers: { "Authorization": "Bearer " + MP_TOKEN }
  })
  .then(function(r) { return r.json(); })
  .then(function(p) {
    if (p.status === "approved") {
      var meta = p.metadata || {};
      var userId = meta.user_id, planoId = meta.plano_id, analises = meta.analises || 120;
      if (userId) {
        usuarios[userId] = { plano: planoId, analises: analises, dataAssinatura: new Date().toISOString(), paymentId: id };
        console.log("✅ Plano liberado:", userId, planoId);
      }
    }
  })
  .catch(function(e) { console.error("Webhook erro:", e.message); });
});

// ── VERIFICAR PLANO DO USUÁRIO ───────────────────
app.get("/plano/:userId", function(req, res) {
  var userId  = req.params.userId;
  var usuario = usuarios[userId];
  if (usuario) { res.json({ plano: usuario.plano, analises: usuario.analises, dataAssinatura: usuario.dataAssinatura, ativo: true }); }
  else { res.json({ plano: "gratuito", analises: 20, ativo: false }); }
});

// ── DIAGNÓSTICO ──────────────────────────────────
app.post("/diagnostico", function(req, res) {
  var imagem   = req.body.imagem;
  var tipo     = req.body.tipo || "image/jpeg";
  var regiao   = req.body.regiao   || null;
  var altitude = req.body.altitude || null;
  var KEY      = process.env.ANTHROPIC_API_KEY;
  var prompt   = buildPrompt(regiao, altitude, false);
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]})
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) { res.json(JSON.parse(m[0])); }
    else { res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── DIAGNÓSTICO VÍDEO ────────────────────────────
app.post("/diagnostico-video", function(req, res) {
  var frames   = req.body.frames;
  var regiao   = req.body.regiao   || null;
  var altitude = req.body.altitude || null;
  var KEY      = process.env.ANTHROPIC_API_KEY;
  if (!frames || frames.length === 0) return res.status(400).json({ erro: "Nenhum frame recebido." });
  var prompt = buildPrompt(regiao, altitude, true);
  var content = [];
  frames.forEach(function(frame, i) {
    content.push({ type: "text", text: "Frame " + (i+1) + " de " + frames.length + ":" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame }});
  });
  content.push({ type: "text", text: prompt });
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: content }]})
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) { res.json(JSON.parse(m[0])); }
    else { res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── ANÁLISE DE SOLO ──────────────────────────────
app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY    = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]})
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) { res.json(JSON.parse(m[0])); }
    else { res.json({ acao: "Nao foi possivel ler o laudo. Verifique a foto e tente novamente.", valores: {} }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── IDENTIFICA DANINHA ───────────────────────────
app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY    = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro." + contexto + "\n\n" +
"Analise a imagem e identifique a planta daninha com precisao. Use o banco de dados abaixo.\n\n" +
"=== PLANTAS DANINHAS DO CAFE ===\n\n" +
"1. PICAO-PRETO (Bidens pilosa): folha larga, sementes com espinhos, flores amarelas. Solo fertil com manejo deficiente. Hospedeira de pragas. 6.000 sementes/planta. PRE: Goal BR 5-6L/ha, Ametrina 800 1,5-2,5kg/ha, Flumyzin 500 150-180mL/ha. POS: Goal BR 6L/ha, Ametrina 800 2,5kg/ha. Controlar ANTES do florescimento.\n\n" +
"2. CAPIM-AMARGOSO (Digitaria insularis): gramínea perene 50-100cm, touceiras, sementes pilosas. Solo degradado com excesso de glifosato. Resistente ao glifosato. Multiplica por rizomas. Plantas antes do florescimento: Glifosato + ACCase + Oleo. Plantas florescidas: rocar, aguardar rebrota, aplicar ACCase. Produtos ACCase: Fusilade 250EW, Gallant Max, Verdict Max 0,2-0,4L/ha, Cletodim/Select 240EC/Poquer 0,45L/ha, Kennox 0,5-0,7L/ha.\n\n" +
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): gramínea anual 30-50cm, touceiras densas. Solo COMPACTADO. 40.000-120.000 sementes/planta. Resistente a multiplos herbicidas. POS: ACCase (fluazifop, haloxifop) + glifosato. Flumioxazin. Galigan 240 3L/ha, Goal BR 2L/ha. Controlar com maximo 1 perfilho.\n\n" +
"4. BUVA/VOADEIRA (Conyza spp.): planta anual ereta ate 2m, pelos, sementes que voam. Solo com excesso de glifosato. Resistente ao glifosato. 200.000 sementes/planta. Controlar com MENOS de 25cm. PROTOX: Oxyfluorfen (Galigan 240EC, Goal BR 240EC), Saflufenacil (Heat 700WG), Carfentrazona (Aurora 400EC). ALS: Metsulfuron (Ally 600WG). Aplicacao sequencial recomendada.\n\n" +
"5. CARURU (Amaranthus spp.): planta anual 20cm-2m, inflorescencias verdes/roxas. Solo fertil com alto N. Hospedeiro de nematoide Meloidogyne. 100.000 sementes/planta. Resistente a multiplos herbicidas. Saflufenacil (Heat 700WG) em plantas ate 5cm. Arranquio manual preventivo.\n\n" +
"6. TIRIRICA (Cyperus rotundus): planta perene 10-60cm, folhas triangulares, flores marrom-escuras. Solo com DRENAGEM RUIM ou compactacao. Multiplica por tuberculos subterraneos. Glifosato + Diurom (Diuron Nortox 800WP). Halosulfuron, imazapic, imazapir, triclopir. Pulverizacao SEQUENCIAL. Arar/gradar para expor tuberculos antes de plantar.\n\n" +
"7. CORDA-DE-VIOLA (Ipomoea spp.): trepadeira ate 3m, flores roxas/rosas/brancas em trompete, folhas coracao. Solo fertil e umido. Tolerante ao glifosato. Enrola nos cafeeiros impedindo fotossintese. Inicio das chuvas: glifosato + 2,4-D. Aurora 400EC, Ally 600WG, Flumizyn 500SC. NAO puxar quando nos cafeeiros — derruba frutos.\n\n" +
"8. CAPIM-BRAQUIARIA (Urochloa/Brachiaria spp.): gramínea robusta. ALIADA nas entrelinhas quando bem manejada. Problema quando chega na linha do cafe. Manter 1 metro de distancia da linha. Rocar antes do florescimento. Urochloa decumbens e U. ruziziensis sao as melhores para entrelinhas. ACCase para controle quimico.\n\n" +
"9. POAIA-BRANCA (Richardia brasiliensis): planta anual rasteira, flores brancas minusculas estreladas, folhas pilosas. Solo umido em regioes quentes. Hospedeira de pragas. Cobertura do solo com palhada. Goal BR, Ametrina em pos-emergencia.\n\n" +
"10. CAPIM-MARMELADA (Urochloa plantaginea): gramínea anual, folhas largas com pelos, ate 80cm. Solo fertil e umido. ACCase em pos-emergencia. Cobertura do solo preventiva.\n\n" +
"11. TRAPOERABA (Commelina benghalensis): planta rasteira suculenta, flores azuis/roxas com 3 petalas. Solo UMIDO, encharcamento. TOLERANTE ao glifosato. Controle: 2,4-D, carfentrazina. Nao usar so glifosato.\n\n" +
"12. GUANXUMA (Sida spp.): arbusto 0,5-1,5m, flores amarelas, folhas dentadas. Solo DEGRADADO e compactado. 2,4-D, metsulfurom em pos-emergencia.\n\n" +
"13. ERVA-QUENTE (Spermacoce latifolia): planta ereta 20-60cm, flores brancas minusculas, folhas opostas. Solo ACIDO com baixo pH. Correcao do pH reduz infestacao. Metsulfurom, glifosato.\n\n" +
"14. CAPIM-DE-BURRO (Cynodon dactylon): gramínea perene rasteira, estoloes, forma tapete verde. Solo COMPACTADO e pisoteado. ACCase em pos-emergencia. Dificil erradicacao — rizomas e estoloes.\n\n" +
"15. MARIA-PRETINHA (Solanum americanum): planta 30-80cm, flores brancas, frutos redondos verdes ficando pretos. Solo fertil e umido. Hospedeira de virus e nematoides. FRUTOS TOXICOS para humanos e animais. Glifosato, 2,4-D em pos-emergencia. Arranquio antes da frutificacao.\n\n" +
"=== INDICADORES DE SOLO ===\n" +
"Solo ACIDO: erva-quente, tiririca, capim-pe-de-galinha.\n" +
"Solo COMPACTADO: capim-pe-de-galinha, tiririca, capim-de-burro, guanxuma.\n" +
"Solo FERTIL: picao-preto, caruru, corda-de-viola, poaia-branca, maria-pretinha.\n" +
"Solo UMIDO/drenagem ruim: tiririca, trapoeraba, poaia-branca.\n" +
"Excesso de GLIFOSATO: buva, capim-amargoso (ambas resistentes).\n" +
"Solo DEGRADADO: buva, capim-amargoso, guanxuma.\n\n" +
"=== MANEJO INTEGRADO ===\n" +
"Preventivo: limpar maquinas para nao disseminar sementes.\n" +
"Cultural: braquiaria nas entrelinhas suprime daninhas.\n" +
"Mecanico: rocadas antes do florescimento.\n" +
"Fisico: palhada de casca de cafe nas linhas.\n" +
"Quimico: rotacionar mecanismos de acao — nunca usar sempre o mesmo herbicida.\n" +
"Regra de ouro: controlar quando plantas sao JOVENS E PEQUENAS.\n\n" +
"RESPONDA SOMENTE JSON sem texto extra:\n" +
"{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que esta planta indica sobre o solo em linguagem simples para produtor rural\",\"acao\":\"orientacao de manejo integrado em linguagem simples e direta\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\",\"produtos\":[{\"nome\":\"nome comercial\",\"ingrediente_ativo\":\"i.a.\",\"dose\":\"dose por hectare\",\"momento\":\"pre-emergencia|pos-emergencia\",\"observacao\":\"quando usar\"}],\"alerta\":\"observacao critica para o produtor\",\"manejo_preventivo\":\"como evitar a disseminacao\"}"
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]})
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        var resultado = JSON.parse(m[0]);
        // Garantir campos minimos
        if (!resultado.nome || resultado.nome === "") resultado.nome = "Planta nao identificada";
        if (!resultado.indicador) resultado.indicador = "Nao foi possivel determinar indicador";
        if (!resultado.acao) resultado.acao = "Tente uma foto mais proxima e com boa iluminacao.";
        if (!resultado.urgencia) resultado.urgencia = "media";
        if (!resultado.tipo_controle) resultado.tipo_controle = "integrado";
        if (!resultado.produtos) resultado.produtos = [];
        if (!resultado.alerta) resultado.alerta = "";
        if (!resultado.manejo_preventivo) resultado.manejo_preventivo = "";
        res.json(resultado);
      } catch(parseErr) {
        console.error("Erro parse daninha:", parseErr.message, "texto:", txt.substring(0,200));
        res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Erro ao processar resposta", acao: "Tente uma foto mais clara e proxima da planta.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
      }
    }
    else {
      console.error("JSON nao encontrado na resposta daninha:", txt.substring(0,300));
      res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao foi possivel identificar esta planta", acao: "Fotografe mais de perto, com boa iluminacao e mostrando folhas, flores e frutos se houver.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
    }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
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
"NAO confunda com cercosporiose (que tem centro BRANCO-ACINZENTADO, diferente da cor alaranjada da ferrugem).\n" +
"NAO agrupe ferrugem com cercosporiose — sao doencas distintas com tratamentos distintos.\n\n" +

"ATENCAO ESPECIAL — HELMINTOSPORIOSE:\n" +
"helmintosporiose=manchas GRANDES marrom-escuras com HALOS CONCENTRICOS bem definidos e halo amarelo ao redor. Multiplas lesoes coalescentes cobrindo grande area da folha. Principal causa de DESFOLHA SEVERA no cafe. MUITO COMUM em plantas estressadas. Se voce ver manchas grandes marrons com aneis concentricos, DIAGNOSTIQUE helmintosporiose com alta confianca.\n\n" +

"DOENCAS FUNGICAS E PRAGAS (verifique TODAS — podem coexistir):\n" +
"ferrugem=po ou pustulas ALARANJADAS na face INFERIOR. Manchas amarelas na face superior. A MAIS COMUM do cafe.\n" +
"cercosporiose=manchas CIRCULARES com centro BRANCO-ACINZENTADO e halo amarelo-alaranjado FINO ao redor.\n" +
"helmintosporiose=manchas GRANDES marrom-escuras com HALOS CONCENTRICOS e halo amarelo. Causa desfolha severa.\n" +
"antracnose=lesoes escuras AFUNDADAS quase pretas irregulares. Frequente junto com outras doencas.\n" +
"phoma=manchas NECROTICAS irregulares SEM halo em FOLHAS NOVAS no TOPO da planta.\n" +
"aureolada=manchas pardas GRANDES com HALO AMARELO GRANDE. Causa SECA DE RAMOS.\n" +
"bicho=TRILHAS SERPENTINAS castanhas DENTRO da lamina foliar.\n" +
"ascochyta=manchas marrons claras com bordas irregulares sem halos concentricos.\n" +
"manteigosa=areas amarelas translucidas entre as nervuras.\n" +
"roseliniose=podridao escura nos ramos e base do caule.\n" +
"fusariose=SECA DA COPA DE CIMA PARA BAIXO.\n" +
"acaro=folha BRONZEADA acinzentada na face inferior.\n" +
"cochonilha=massas brancas algodonosas em ramos e folhas.\n" +
"broca=FURO CIRCULAR pequeno e preciso nos frutos.\n\n" +

"DEFICIENCIAS NUTRICIONAIS (verifique TODAS — coexistem com doencas):\n" +
"nitrogenio=folha TODA AMARELA UNIFORME nas folhas VELHAS.\n" +
"magnesio=nervuras VERDES com tecido AMARELO internerval nas folhas VELHAS.\n" +
"potassio=QUEIMA de bordas e PONTAS nas folhas VELHAS. Coloracao geral palida clorotica.\n" +
"ferro=folhas NOVAS ESBRANQUICADAS com NERVURAS VERDES.\n" +
"calcio=folhas NOVAS deformadas ENCURVADAS com ponteiros mortos.\n" +
"boro=folhas NOVAS QUEBRADICAS DEFORMADAS com ponteiros mortos.\n" +
"zinco=folhas NOVAS ESTREITAS aspecto ROSETA.\n" +
"manganes=PONTUACOES cloroticas pequenas nas folhas NOVAS.\n" +
"fosforo=folhas ESCURECIDAS verde-escura a preta.\n" +
"enxofre=folhas NOVAS amarelas UNIFORMES.\n" +
"cobre=manchas NECROTICAS em folhas NOVAS deformadas.\n" +
"estresse_hidrico=folha MURCHA bordas secas com enrolamento.\n" +
"escaldadura=manchas amarelas irregulares por excesso de sol direto.\n" +
"fitotoxicidade=manchas necroticas apos aplicacao de produto.\n\n" +

"SE FOR FRUTO:\n" +
"fruto_verde=fruto verde saudavel.\n" +
"fruto_maduro=fruto cereja no ponto ideal de colheita.\n" +
"fruto_passado=fruto seco mumificado.\n\n" +

"PRODUTOS E DOSES PARA O JSON:\n" +
"ferrugem fungicidas: [{nome:Tebuconazol 200SC,nome_comercial:Folicur,tipo:sistemico,dose_min:0.75,dose_max:1.0,unidade:L,por:hectare,proporcao_por_litro:0.05,unidade_proporcao:L,intervalo_reaplicacao:21,carencia_dias:7},{nome:Oxicloreto de Cobre 840WP,nome_comercial:Recop,tipo:protetor,dose_min:2.0,dose_max:2.5,unidade:kg,por:hectare,proporcao_por_litro:2.5,unidade_proporcao:g,intervalo_reaplicacao:21,carencia_dias:7}]\n" +
"cercosporiose fungicidas: [{nome:Oxicloreto de Cobre 840WP,nome_comercial:Recop,tipo:protetor,dose_min:2.0,dose_max:2.5,unidade:kg,por:hectare,proporcao_por_litro:2.5,unidade_proporcao:g,intervalo_reaplicacao:21,carencia_dias:7},{nome:Tebuconazol 200SC,nome_comercial:Folicur,tipo:sistemico,dose_min:0.75,dose_max:1.0,unidade:L,por:hectare,proporcao_por_litro:0.05,unidade_proporcao:L,intervalo_reaplicacao:21,carencia_dias:7}]\n" +
"helmintosporiose fungicidas: [{nome:Tebuconazol 200SC,nome_comercial:Folicur,tipo:sistemico,dose_min:0.75,dose_max:1.0,unidade:L,por:hectare,proporcao_por_litro:0.05,unidade_proporcao:L,intervalo_reaplicacao:14,carencia_dias:7},{nome:Tiofanato Metilico 700WP,nome_comercial:Cercobin,tipo:protetor,dose_min:1.0,dose_max:1.5,unidade:kg,por:hectare,proporcao_por_litro:1.25,unidade_proporcao:g,intervalo_reaplicacao:14,carencia_dias:7}]\n" +
"antracnose fungicidas: [{nome:Azoxistrobina+Difenoconazol,nome_comercial:Amistar Top,tipo:sistemico,dose_min:0.3,dose_max:0.4,unidade:L,por:hectare,proporcao_por_litro:0.3,unidade_proporcao:mL,intervalo_reaplicacao:14,carencia_dias:7}]\n" +
"phoma fungicidas: [{nome:Tiofanato Metilico 700WP,nome_comercial:Cercobin,tipo:protetor,dose_min:1.0,dose_max:1.5,unidade:kg,por:hectare,proporcao_por_litro:1.25,unidade_proporcao:g,intervalo_reaplicacao:21,carencia_dias:7}]\n" +
"aureolada fungicidas: [{nome:Oxicloreto de Cobre 840WP,nome_comercial:Recop,tipo:protetor,dose_min:2.5,dose_max:2.5,unidade:kg,por:hectare,proporcao_por_litro:2.5,unidade_proporcao:g,intervalo_reaplicacao:21,carencia_dias:7}]\n" +
"bicho fungicidas: [{nome:Thiamethoxam 250WG,nome_comercial:Actara,tipo:inseticida,dose_min:0.1,dose_max:0.2,unidade:kg,por:hectare,proporcao_por_litro:0.15,unidade_proporcao:g,intervalo_reaplicacao:30,carencia_dias:14}]\n" +
"acaro fungicidas: [{nome:Abamectina 18EC,nome_comercial:Vertimec,tipo:acaricida,dose_min:0.5,dose_max:0.75,unidade:L,por:hectare,proporcao_por_litro:0.0625,unidade_proporcao:mL,intervalo_reaplicacao:21,carencia_dias:14}]\n" +
"broca fungicidas: [{nome:Clorpirifos 480EC,nome_comercial:Lorsban,tipo:inseticida,dose_min:1.5,dose_max:2.0,unidade:L,por:hectare,proporcao_por_litro:1.75,unidade_proporcao:mL,intervalo_reaplicacao:30,carencia_dias:14}]\n\n" +

"INSTRUCOES FINAIS OBRIGATORIAS:\n" +
"1. Liste TODOS os problemas encontrados no array diagnosticos — sem limite de quantidade.\n" +
"2. Ordene do mais grave para o menos grave.\n" +
"3. Se houver manchas alaranjadas na face inferior, ferrugem DEVE obrigatoriamente aparecer no array.\n" +
"4. Se houver manchas grandes marrons com halos concentricos, helmintosporiose DEVE aparecer no array.\n" +
"5. Se a folha tiver coloracao geral palida ou clorotica sem brilho, inclua a deficiencia nutricional correspondente.\n" +
"6. Diagnosticos diferentes na mesma folha sao normais e esperados — LISTE TODOS SEM EXCECAO.\n" +
"7. Deficiencias nutricionais nao tem fungicidas — retorne fungicidas:[] para elas.\n" +
"8. Se a imagem mostrar MUITAS FOLHAS SECAS CAIDAS no chao ou ramos desfolhados ao fundo, inclua helmintosporiose ou ferrugem avancada como diagnostico pois sao as principais causas de desfolha severa no cafe.\n" +
"9. NUNCA retorne saudavel se houver qualquer mancha, lesao, necrose, descoloracao ou sintoma visivel na folha ou no contexto da imagem.\n\n" +

"RESPONDA SOMENTE JSON, sem texto antes ou depois:\n" +
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato_da_lista_acima\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descricao do sinal visual observado na imagem\",\"acao\":\"o que o produtor deve fazer em linguagem simples e direta\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"exemplo de marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":1.5,\"dose_max\":2.5,\"unidade\":\"kg|L|mL\",\"por\":\"hectare\",\"proporcao_por_litro\":2.5,\"unidade_proporcao\":\"g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
