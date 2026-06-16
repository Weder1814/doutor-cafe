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

// ── WAKE-UP ENDPOINT (novo) ──
// O frontend chama isso ao abrir o app para "acordar" o Railway
app.get("/ping", function(req, res) {
  res.json({ ok: true, ts: Date.now() });
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

// ── PROMPT OTIMIZADO (~60% menor, mesma qualidade) ──
function buildPrompt(regiao, altitude, isVideo) {
  var ctx = "";
  if (regiao) {
    var defs = {
      "Cerrado Mineiro":"solos acidos, deficiencia Ca Mg B, ferrugem em anos umidos",
      "Sul de Minas":"altitude >800m, risco Phoma Cercosporiose, deficiencia Zn",
      "Mogiana":"clima quente 22-26C, risco acaro broca em seco, deficiencia K",
      "Matas de Minas":"alta umidade, ferrugem bicho-mineiro, deficiencia P Mg",
      "Chapada Diamantina":"altitude elevada, Phoma, deficiencia N B",
      "Planalto da Bahia":"clima seco, acaro vermelho, deficiencia Fe",
      "Rondonia":"alta umidade, ferrugem antracnose cercosporiose, solos acidos",
      "Norte do Parana":"risco geadas maio-ago, deficiencia Mn",
      "Espirito Santo":"alta umidade, cercosporiose cochonilha",
      "Alta Paulista":"clima quente e seco, acaro vermelho, deficiencia Zn"
    };
    ctx = "\nRegiao: "+regiao+(defs[regiao]?" ("+defs[regiao]+")":"")+(altitude?", "+altitude+"m":"")+"."+(altitude>900?" Risco Phoma/Cercosporiose.":"")+(altitude<600?" Risco ferrugem/acaro/broca.":"");
  }

  return "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira."+ctx+"\n"+
(isVideo?"Analise TODOS os frames juntos como uma unica planta.\n":"")+
"REGRA CRITICA: Liste TODOS os problemas visiveis. Ferrugem+Cercosporiose+deficiencias frequentemente ocorrem juntas — liste TODAS. NUNCA retorne saudavel se houver qualquer sintoma.\n\n"+
"DOENCAS:\nferrugem=pustulas ALARANJADAS face inferior, manchas amarelas face superior — A MAIS COMUM\n"+
"cercosporiose=manchas circulares centro BRANCO halo amarelo fino\nhelmintosporiose=manchas GRANDES marrom halos concentricos — causa desfolha\n"+
"antracnose=lesoes pretas afundadas\nphoma=necrose folhas novas\naureolada=manchas pardas halo amarelo grande\nbicho=trilhas serpentinas\n"+
"acaro=folha bronzeada face inferior\ncochonilha=massas brancas em ramos\nbroca=furo circular frutos\n\n"+
"NUTRICAO:\nnitrogenio=folha toda amarela uniforme folhas velhas\nmagnesio=nervuras verdes tecido amarelo internerval folhas velhas\n"+
"potassio=queima bordas folhas velhas\nferro=folhas novas brancas nervuras verdes\ncalcio=folhas novas deformadas ponteiros mortos\n"+
"boro=folhas novas quebradicas\nzinco=folhas novas estreitas roseta\nmanganes=pontuacoes cloroticas\nfosforo=folhas verde-escuro quase preto\n"+
"enxofre=folhas novas amarelas uniformes\ncobre=manchas necroticas folhas novas\n"+
"estresse_hidrico=folha murcha bordas secas\nescaldadura=manchas amarelas irregulares sol\nfitotoxicidade=danos pos-aplicacao\nfruto_verde; fruto_maduro; fruto_passado\n\n"+
"PRODUTOS:\nferrugem/cercosporiose: Tebuconazol 200SC sistemico 0.75-1L/ha prop:0.05L/20L int:21d; Oxicloreto Cobre protetor 2-2.5kg/ha prop:2.5g/20L\n"+
"helmintosporiose: Tebuconazol 200SC 0.75-1L/ha int:14d; Tiofanato Metilico 700WP 1-1.5kg/ha prop:1.25g/20L\n"+
"antracnose: Azoxistrobina+Difenoconazol 0.3-0.4L/ha prop:0.3mL/20L\nbicho: Thiamethoxam 250WG 0.1-0.2kg/ha\nacaro: Abamectina 18EC 0.5-0.75L/ha\nbroca: Clorpirifos 480EC 1.5-2L/ha\n\n"+
"Ordene do mais grave ao menos grave. Deficiencias nutricionais: fungicidas:[].\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"resumo_geral\":\"2-3 frases simples com nomes populares\",\"plano_acao\":{\"urgente\":\"o que fazer essa semana com produto e dose\",\"em_21_dias\":\"proximo passo\",\"nutricao\":\"correcao nutricional ou vazio\",\"resumo\":\"frase curta\"},"+
"\"diagnosticos\":[{\"diagnostico\":\"nome\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"o que fazer\","+
"\"fungicidas\":[{\"nome\":\"generico\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

// ── DIAGNÓSTICO — max_tokens reduzido de 2500 → 1400 ──
app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1400,  // REDUZIDO de 2500
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
        { type: "text", text: buildPrompt(regiao, altitude, false) }
      ]}]
    })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try { res.json(JSON.parse(m[0])); }
      catch(e) { res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] }); }
    } else {
      res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente.", fungicidas: [] }] });
    }
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── DIAGNÓSTICO VÍDEO — max_tokens reduzido de 2000 → 1400 ──
app.post("/diagnostico-video", function(req, res) {
  var frames = req.body.frames, regiao = req.body.regiao || null, altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  if (!frames || frames.length === 0) return res.status(400).json({ erro: "Nenhum frame recebido." });

  var content = [];
  frames.forEach(function(frame, i){
    content.push({ type: "text", text: "Frame " + (i+1) + ":" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame }});
  });
  content.push({ type: "text", text: buildPrompt(regiao, altitude, true) });

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content }]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) res.json(JSON.parse(m[0]));
    else res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar.", fungicidas: [] }] });
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── ANÁLISE DE SOLO ──
app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var ctx = regiao ? " Regiao: " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura."+ctx+"\nAnalise este laudo de solo e faca recomendacoes para cafe arabica.\nRESPONDA SOMENTE JSON:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"v\",\"status\":\"ok|baixo|alto\"}}}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
      { type: "text", text: prompt }
    ]}]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) res.json(JSON.parse(m[0]));
    else res.json({ acao: "Nao foi possivel ler o laudo. Verifique a foto.", valores: {} });
  })
  .catch(function(e){ res.status(500).json({ erro: e.message }); });
});

// ── IDENTIFICA DANINHA ── usa Haiku (mais rápido e barato)
app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem, tipo = req.body.tipo || "image/jpeg", regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var ctx = regiao ? " Regiao: " + regiao + "." : "";

  var prompt = "Voce e o Doutor Cafe, agronomista especialista em plantas daninhas do cafe."+ctx+"\n\n"+
"PLANTAS DANINHAS COMUNS DO CAFE:\npicao-preto=solo fertil; capim-amargoso=solo degradado resistente-glifosato; capim-pe-de-galinha=solo compactado; buva=excesso glifosato; caruru=solo fertil alto-N; tiririca=drenagem ruim; corda-de-viola=solo fertil umido; braquiaria=aliada entrelinhas problema linha; poaia-branca=solo umido; trapoeraba=solo umido tolerante-glifosato; guanxuma=solo degradado; erva-quente=solo acido; maria-pretinha=solo fertil frutos TOXICOS.\n\n"+
"INDICADORES: Acido=erva-quente,tiririca,capim-pe-de-galinha. Compactado=capim-pe-de-galinha,tiririca. Fertil=picao-preto,caruru,corda-de-viola. Umido=tiririca,trapoeraba. Excesso-glifosato=buva,capim-amargoso.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo em linguagem simples\",\"acao\":\"o que fazer agora\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\",\"produtos\":[{\"nome\":\"produto\",\"dose\":\"dose\",\"momento\":\"quando\",\"como_usar\":\"instrucao\"}],\"alerta\":\"aviso importante\",\"manejo_preventivo\":\"dica preventiva\"}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 900, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
      { type: "text", text: prompt }
    ]}]})
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
    if (m) {
      try {
        var r = JSON.parse(m[0]);
        if (!r.nome) r.nome = "Planta nao identificada";
        if (!r.produtos) r.produtos = [];
        res.json(r);
      } catch(e) {
        res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Erro ao processar", acao: "Tente foto mais clara.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
      }
    } else {
      res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao identificada", acao: "Fotografe mais de perto.", urgencia: "baixa", tipo_controle: "nenhum", produtos: [], alerta: "", manejo_preventivo: "" });
    }
  }).catch(function(e){ res.status(500).json({ erro: e.message }); });
});

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
