var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

var MP_TOKEN = process.env.MP_ACCESS_TOKEN || "TEST-c183e079-b54a-4347-9840-89e88555cb48";
var BASE_URL = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";

// ── PLANOS ──────────────────────────────────────
var PLANOS = {
  basico_mensal:  { nome: "Básico Mensal",  valor: 3290,  analises: 120, ciclo: "monthly" },
  basico_anual:   { nome: "Básico Anual",   valor: 29990, analises: 120, ciclo: "yearly"  },
  pro_mensal:     { nome: "Pro Mensal",     valor: 4990,  analises: 999999, ciclo: "monthly" },
  pro_anual:      { nome: "Pro Anual",      valor: 49990, analises: 999999, ciclo: "yearly"  }
};

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

// ── CRIAR PREFERÊNCIA DE PAGAMENTO ──────────────
app.post("/criar-assinatura", function(req, res) {
  var planoId = req.body.plano;
  var email = req.body.email || "produtor@doutorcafe.app";
  var userId = req.body.userId;
  var plano = PLANOS[planoId];

  if (!plano) return res.status(400).json({ erro: "Plano inválido" });

  var body = {
    items: [{
      title: "Doutor Café — " + plano.nome,
      quantity: 1,
      unit_price: plano.valor / 100,
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
      res.status(500).json({ erro: "Erro ao criar preferência", detalhe: d });
    }
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
      console.log("Pagamento aprovado:", {
        plano: meta.plano_id,
        userId: meta.user_id,
        analises: meta.analises,
        valor: p.transaction_amount
      });
    }
  })
  .catch(function(e) { console.error("Webhook erro:", e.message); });
});

// ── VERIFICAR PLANO ──────────────────────────────
app.get("/verificar-plano/:userId", function(req, res) {
  // Por enquanto retorna gratuito — futuramente integra banco de dados
  res.json({ plano: "gratuito", analises_restantes: 20, analises_usadas: 0 });
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
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nTABELA DE INTERPRETACAO INCAPER PARA CAFE ARABICA (Prezotti, 2018):\npH CaCl2: ideal 5,6-6,5 / medio 4,6-5,5 / alto acido <4,5\nP (argiloso) Mehlich-1: baixo <5 / medio 5-10 / alto >10 mg/dm3\nP (medio) Mehlich-1: baixo <10 / medio 10-20 / alto >20 mg/dm3\nP (arenoso) Mehlich-1: baixo <20 / medio 20-30 / alto >30 mg/dm3\nK Mehlich-1: baixo <60 / medio 60-150 / alto >150 mg/dm3\nCa KCl: baixo <1,5 / medio 1,5-4,0 / alto >4,0 cmolc/dm3\nMg KCl: baixo <0,5 / medio 0,5-1,0 / alto >1,0 cmolc/dm3\nAl KCl: baixo <0,3 / medio 0,3-1,0 / alto >1,0 cmolc/dm3\nV%: baixo <50 / medio 50-70 / alto >70%\nMO: baixo <1,5 / medio 1,5-3,0 / alto >3,0 dag/dm3\nB agua quente: baixo <0,3 / medio 0,3-0,9 / alto >0,9 mg/dm3\nZn Mehlich-1: baixo <1,0 / medio 1,0-2,2 / alto >2,2 mg/dm3\nCu Mehlich-1: baixo <0,8 / medio 0,8-1,8 / alto >1,8 mg/dm3\nFe Mehlich-1: baixo <20 / medio 20-45 / alto >45 mg/dm3\nMn Mehlich-1: baixo <5 / medio 5-12 / alto >12 mg/dm3\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples para o produtor incluindo se precisa de calagem quanto de NPK por hectare e quais micronutrientes corrigir\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
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
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira." + contexto + "\n\nAnalise a imagem desta planta encontrada em uma lavoura de cafe. Identifique a planta daninha e informe o que ela indica sobre o solo e como controlar.\n\nCONHECIMENTO COMPLETO DE PLANTAS DANINHAS DO CAFE:\npicao_preto=Picao-preto (Bidens pilosa). INDICA: solo fertil com materia organica mas hospeda pragas. Sementes duram 5 anos no solo. CONTROLE: mucuna-preta ou palhada. Quimico: Flumyzin 500 (150-180ml/ha) ou Ametrina 800 (1,5-2,5kg/ha). Pos-emergencia: Goal BR (6L/ha).\ncapim_amargoso=Capim-amargoso (Digitaria insularis). INDICA: solo com uso intensivo, rizomas subterraneos. CONTROLE: rocar primeiro, aguardar rebrota. Cletodim 240 (0,45L/ha) ou Verdict Max 540 (0,2-0,4L/ha) + glifosato + oleo.\ncapim_pe_de_galinha=Capim-pe-de-galinha (Eleusine indica). INDICA: solo COMPACTADO. CONTROLE: controlar com maximo 1 perfilho. Fluazifop ou Haloxyfop + glifosato. Galigan 240 (3L/ha).\nbuva=Buva (Conyza spp.). INDICA: resistencia ao glifosato. CONTROLE: aplicar antes de 25cm. Galigan 240EC (3L/ha), Aurora 400EC, Heat 700WG.\ncaruru=Caruru (Amaranthus spp.). INDICA: excesso de NITROGENIO. Hospedeiro do nematoide Meloidogyne. CONTROLE: arranquio manual. Heat 700WG em plantas ate 5cm.\ntiririca=Tiririca (Cyperus rotundus). INDICA: solo ACIDO com deficiencia de MAGNESIO. CONTROLE: arar para expor tuberculos. Glifosato + Diuron Nortox 800WP. Pulverizacao sequencial.\nassapeixe=Assa-peixe. INDICA: solo ACIDO com baixo calcio e magnesio. CONTROLE: calcario dolomítico, elevar pH a 5,5-6,0.\nguanxuma=Guanxuma. INDICA: solo COMPACTADO. CONTROLE: subsolagem mecanica e materia organica.\nbeldroega=Beldroega. INDICA: EXCESSO DE UMIDADE e drenagem ruim. CONTROLE: melhorar drenagem.\nfedegoso=Fedegoso. INDICA: solo DEGRADADO com baixo calcio. CONTROLE: calagem e adubacao organica.\ncapim_marmelada=Capim-marmelada. INDICA: solo FERTIL bem estruturado. Sinal POSITIVO mas controlar competicao.\ncorda_de_viola=Corda-de-viola (Ipomoea spp.). INDICA: manejo inadequado. Trepadeira que PREJUDICA A COLHEITA. CONTROLE: inicio das chuvas. Glifosato, 2,4-D, Aurora 400EC, Ally 600WG.\nbraquiaria=Braquiaria. BOA nas entrelinhas mas PROBLEMA na linha. Manter 1 metro de distancia. CONTROLE: inibidores de ACCase.\npoaia_branca=Poaia-branca. INDICA: solo quente fertil, hospedeira de pragas. CONTROLE: cobertura morta ou herbicidas direcionados.\nRESPONDA SOMENTE JSON:\n{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica no solo\",\"acao\":\"como controlar com produtos e doses\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\"}";
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
      "Cerrado Mineiro": "solos acidos com deficiencia frequente de Calcio Magnesio e Boro. Alta incidencia de ferrugem em anos umidos. Altitude 800-1100m favorece Phoma.",
      "Sul de Minas": "altitudes acima de 800m favorecem Phoma e Cercosporiose. Solos com boa fertilidade mas risco de deficiencia de Zinco. Geadas ocasionais.",
      "Mogiana": "regiao quente 22-26C com risco de acaro vermelho e broca em periodos secos junho-agosto. Deficiencia de Potassio comum. Altitude media 700-900m.",
      "Matas de Minas": "alta umidade favorece ferrugem e bicho-mineiro. Solos com deficiencia de Fosforo e Magnesio. Risco de Cercosporiose em areas de sol pleno.",
      "Chapada Diamantina": "altitude elevada favorece Phoma. Solos rasos com deficiencia de Nitrogenio e Boro. Seca prolongada favorece acaro e broca.",
      "Planalto da Bahia": "clima seco favorece acaro vermelho e estresse hidrico. Deficiencia de Ferro em solos alcalinos pH acima de 6,5. Broca ativa o ano todo.",
      "Rondonia": "alta umidade e temperatura 24-28C favorecem ferrugem antracnose e cercosporiose. Solos acidos com deficiencia de Calcio. Conilon predomina.",
      "Norte do Parana": "risco de geadas maio-agosto causa fitotoxicidade e escaldadura. Solos ferteis mas risco de deficiencia de Manganes.",
      "Espirito Santo": "cafeeiros conilon predominantes. Alta umidade favorece cercosporiose e cochonilha. Risco de fusariose em cafeeiros velhos pos-poda.",
      "Alta Paulista": "clima quente e seco favorece acaro vermelho. Deficiencia de Zinco frequente. Broca ativa em periodos secos."
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
  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia baseado nos trabalhos do Prof. Jose Donizeti Alves (UFLA) e nas normas da Embrapa e Incaper." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO.\n\nDOENÇAS FUNGICAS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR da folha.\nbicho=TRILHAS SERPENTINAS castanhas DENTRO da folha.\ncercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\nphoma=manchas NECROTICAS irregulares SEM halo em FOLHAS NOVAS no TOPO.\nantracnose=lesoes escuras AFUNDADAS quase pretas.\nascochyta=manchas marrons claras bordas irregulares.\nmanteigosa=areas amarelas translucidas entre as nervuras.\nroseliniose=podridao escura nos ramos e base do caule.\nhelmintosporiose=manchas grandes marrons com halos concentricos.\nfusariose=SECA DA COPA DE CIMA PARA BAIXO.\n\nDOENCAS BACTERIANAS:\naureolada=manchas pardas GRANDES com HALO AMARELO GRANDE. SECA DE RAMOS.\n\nDEFICIENCIAS NUTRICIONAIS:\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\nnitrogenio=folha TODA AMARELA UNIFORME folhas VELHAS.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas VELHAS.\npotassio=QUEIMA de bordas e PONTAS folhas VELHAS.\nfosforo=folhas ESCURECIDAS verde-escura a preta.\ncobre=manchas NECROTICAS folhas NOVAS deformadas.\nmanganes=PONTUACOES cloroticas pequenas folhas NOVAS.\nboro=folhas NOVAS QUEBRADICAS DEFORMADAS ponteiros mortos.\nzinco=folhas NOVAS ESTREITAS aspecto ROSETA.\nferro=folhas NOVAS ESBRANQUICADAS NERVURAS VERDES.\nenxofre=folhas NOVAS amarelas UNIFORMES.\nacaro=folha BRONZEADA acinzentada face inferior.\nestresse_hidrico=folha MURCHA bordas secas enrolamento.\nescaldadura=manchas amarelas irregulares por excesso de sol.\nfitotoxicidade=manchas necroticas pos aplicacao.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR pequeno e preciso.\nantracnose=lesoes escuras AFUNDADAS nos frutos.\nfruto_verde=fruto verde saudavel.\nfruto_maduro=fruto cereja no ponto ideal.\nfruto_passado=fruto seco mumificado.\n\nPRODUTOS E DOSES:\nferrugem: Tebuconazol 200SC (0,75-1,0L/ha a cada 21 dias) OU Oxicloreto de Cobre 840WP (2,0-2,5kg/ha).\ncercosporiose: Oxicloreto de Cobre 840WP (2,0-2,5kg/ha) OU Tebuconazol (0,75-1,0L/ha). Intervalo 21 dias.\nphoma: Tiofanato Metilico 700WP (1,0-1,5kg/ha) OU Procimidona (1,0L/ha).\nantracnose: Azoxistrobina+Difenoconazol (0,3L/ha) OU Tiofanato Metilico (1,0kg/ha).\nbicho: Thiamethoxam 250WG (0,1-0,2kg/ha) OU Imidacloprido (0,3-0,5L/ha).\nbroca: Clorpirifos 480EC (1,5-2,0L/ha) OU Beauveria bassiana (1,0kg/ha).\nacaro: Abamectina 18EC (0,5-0,75L/ha) OU Enxofre 800WP (3,0-4,0kg/ha).\ncochonilha: Clorpirifos 480EC (1,5L/ha) OU Imidacloprido (0,5L/ha).\naureolada: Oxicloreto de Cobre (2,5kg/ha) OU Mancozebe+Cobre.\n\nREGRAS:\n1. Ferrugem SEMPRE na face inferior.\n2. Centro branco-acinzentado=cercosporiose, alaranjado=ferrugem.\n3. SECA DE RAMOS=aureolada.\n4. Liste ate 3 diagnosticos por gravidade.\n5. Considere contexto regional.\n\nRESPONDA SOMENTE JSON:\n{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual observado\",\"acao\":\"o que fazer em linguagem simples\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"exemplo de marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":1.5,\"dose_max\":2.5,\"unidade\":\"kg|L|mL\",\"por\":\"hectare\",\"proporcao_por_litro\":2.5,\"unidade_proporcao\":\"g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
