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
  var nome = req.body.nome || "Produtor Rural";
  var cpf = req.body.cpf || "00000000000";

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    transaction_amount: plano.valor,
    description: plano.nome,
    payment_method_id: "pix",
    payer: {
      email: email,
      first_name: nome ? nome.split(' ')[0] : "Produtor",
      last_name: nome ? nome.split(' ').slice(1).join(' ') || "Rural" : "Rural",
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

// ── DIAGNÓSTICO VÍDEO ────────────────────────────
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

// ── ANÁLISE DE SOLO ──────────────────────────────
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

// ── IDENTIFICA DANINHA ───────────────────────────
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
