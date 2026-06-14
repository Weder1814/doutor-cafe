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

// ── BANCO DE DADOS SIMPLES (em memória) ──────────
// Em produção use um banco real como PostgreSQL
var usuarios = {};

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

// ── GERAR PIX DINÂMICO ───────────────────────────
app.post("/gerar-pix", function(req, res) {
  var planoId = req.body.plano;
  var userId = req.body.userId;
  var email = req.body.email || "produtor@doutorcafe.app";
  var plano = PLANOS[planoId];

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    transaction_amount: plano.valor,
    description: plano.nome,
    payment_method_id: "pix",
    payer: {
      email: email,
      first_name: "Produtor",
      last_name: "Rural",
      identification: { type: "CPF", number: "00000000000" }
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
  var email = req.body.email || "produtor@doutorcafe.app";
  var userId = req.body.userId;
  var plano = PLANOS[planoId];

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    items: [{
      title: plano.nome,
      quantity: 1,
      unit_price: plano.valor,
      currency_id: "BRL"
    }],
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
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + MP_TOKEN
    },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.id) {
      res.json({ url: d.init_point, id: d.id });
    } else {
      console.error("Erro MP Cartão:", JSON.stringify(d));
      res.status(500).json({ erro: "Erro ao criar preferência", detalhe: d.message || d.error });
    }
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
    res.json({
      status: p.status,
      aprovado: p.status === "approved",
      plano_id: p.metadata && p.metadata.plano_id,
      user_id: p.metadata && p.metadata.user_id
    });
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

// ── WEBHOOK MERCADO PAGO ─────────────────────────
app.post("/webhook-pagamento", function(req, res) {
  var tipo = req.body.type;
  var id = req.body.data && req.body.data.id;

  res.status(200).send("OK");

  if (tipo !== "payment" || !id) return;

  fetch("https://api.mercadopago.com/v1/payments/" + id, {
    headers: { "Authorization": "Bearer " + MP_TOKEN }
  })
  .then(function(r) { return r.json(); })
  .then(function(p) {
    if (p.status === "approved") {
      var meta = p.metadata || {};
      var userId = meta.user_id;
      var planoId = meta.plano_id;
      var analises = meta.analises || 120;

      if (userId) {
        usuarios[userId] = {
          plano: planoId,
          analises: analises,
          dataAssinatura: new Date().toISOString(),
          paymentId: id
        };
        console.log("✅ Plano liberado:", userId, planoId);
      }
    }
  })
  .catch(function(e) { console.error("Webhook erro:", e.message); });
});

// ── VERIFICAR PLANO DO USUÁRIO ───────────────────
app.get("/plano/:userId", function(req, res) {
  var userId = req.params.userId;
  var usuario = usuarios[userId];

  if (usuario) {
    res.json({
      plano: usuario.plano,
      analises: usuario.analises,
      dataAssinatura: usuario.dataAssinatura,
      ativo: true
    });
  } else {
    res.json({ plano: "gratuito", analises: 20, ativo: false });
  }
});

// ── DIAGNÓSTICO ──────────────────────────────────
app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var prompt = buildPrompt(regiao, altitude, false);
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
        { type: "text", text: prompt }
      ]}]
    })
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

app.post("/diagnostico-video", function(req, res) {
  var frames = req.body.frames;
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
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
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: content }] })
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

app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
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

app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira." + contexto + "\n\nAnalise a imagem desta planta daninha e identifique nome, o que indica no solo e como controlar.\n\nRESPONDA SOMENTE JSON:\n{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica no solo\",\"acao\":\"como controlar com produtos e doses\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\"}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: tipo, data: imagem }}, { type: "text", text: prompt }]}]})
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) { res.json(JSON.parse(m[0])); }
    else { res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao foi possivel identificar", acao: "Tente uma foto mais clara.", urgencia: "baixa", tipo_controle: "nenhum" }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

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
  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO.\n\nDOENÇAS FUNGICAS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR da folha.\nbicho=TRILHAS SERPENTINAS castanhas DENTRO da folha.\ncercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\nphoma=manchas NECROTICAS irregulares SEM halo em FOLHAS NOVAS no TOPO.\nantracnose=lesoes escuras AFUNDADAS quase pretas.\nascochyta=manchas marrons claras bordas irregulares.\nmanteigosa=areas amarelas translucidas entre as nervuras.\nroseliniose=podridao escura nos ramos e base do caule.\nhelmintosporiose=manchas grandes marrons com halos concentricos.\nfusariose=SECA DA COPA DE CIMA PARA BAIXO.\naureolada=manchas pardas GRANDES com HALO AMARELO GRANDE. SECA DE RAMOS.\n\nDEFICIENCIAS NUTRICIONAIS:\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\nnitrogenio=folha TODA AMARELA UNIFORME folhas VELHAS.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas VELHAS.\npotassio=QUEIMA de bordas e PONTAS folhas VELHAS.\nfosforo=folhas ESCURECIDAS verde-escura a preta.\ncobre=manchas NECROTICAS folhas NOVAS deformadas.\nmanganes=PONTUACOES cloroticas pequenas folhas NOVAS.\nboro=folhas NOVAS QUEBRADICAS DEFORMADAS ponteiros mortos.\nzinco=folhas NOVAS ESTREITAS aspecto ROSETA.\nferro=folhas NOVAS ESBRANQUICADAS NERVURAS VERDES.\nenxofre=folhas NOVAS amarelas UNIFORMES.\nacaro=folha BRONZEADA acinzentada face inferior.\nestresse_hidrico=folha MURCHA bordas secas enrolamento.\nescaldadura=manchas amarelas irregulares por excesso de sol.\nfitotoxicidade=manchas necroticas pos aplicacao.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR pequeno e preciso.\nantracnose=lesoes escuras AFUNDADAS nos frutos.\nfruto_verde=fruto verde saudavel.\nfruto_maduro=fruto cereja no ponto ideal.\nfruto_passado=fruto seco mumificado.\n\nPRODUTOS E DOSES:\nferrugem: Tebuconazol 200SC (0,75-1,0L/ha a cada 21 dias) OU Oxicloreto de Cobre 840WP (2,0-2,5kg/ha).\ncercosporiose: Oxicloreto de Cobre 840WP (2,0-2,5kg/ha) OU Tebuconazol (0,75-1,0L/ha).\nphoma: Tiofanato Metilico 700WP (1,0-1,5kg/ha).\nantracnose: Azoxistrobina+Difenoconazol (0,3L/ha).\nbicho: Thiamethoxam 250WG (0,1-0,2kg/ha).\nbroca: Clorpirifos 480EC (1,5-2,0L/ha) OU Beauveria bassiana (1,0kg/ha).\nacaro: Abamectina 18EC (0,5-0,75L/ha).\ncochonilha: Clorpirifos 480EC (1,5L/ha).\naureolada: Oxicloreto de Cobre (2,5kg/ha).\n\nRESPONDA SOMENTE JSON:\n{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual observado\",\"acao\":\"o que fazer em linguagem simples\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"exemplo de marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":1.5,\"dose_max\":2.5,\"unidade\":\"kg|L|mL\",\"por\":\"hectare\",\"proporcao_por_litro\":2.5,\"unidade_proporcao\":\"g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
