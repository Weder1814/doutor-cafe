var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

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
      max_tokens: 1500,
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
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: content }] })
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

  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nTABELA DE INTERPRETACAO INCAPER PARA CAFE ARABICA (Prezotti, 2018):\npH CaCl2: ideal 5,6-6,5 / medio 4,6-5,5 / alto acido <4,5\nP (argiloso) Mehlich-1: baixo <5 / medio 5-10 / alto >10 mg/dm3\nP (medio) Mehlich-1: baixo <10 / medio 10-20 / alto >20 mg/dm3\nP (arenoso) Mehlich-1: baixo <20 / medio 20-30 / alto >30 mg/dm3\nK Mehlich-1: baixo <60 / medio 60-150 / alto >150 mg/dm3\nCa KCl: baixo <1,5 / medio 1,5-4,0 / alto >4,0 cmolc/dm3\nMg KCl: baixo <0,5 / medio 0,5-1,0 / alto >1,0 cmolc/dm3\nAl KCl: baixo <0,3 / medio 0,3-1,0 / alto >1,0 cmolc/dm3\nV%: baixo <50 / medio 50-70 / alto >70%\nMO: baixo <1,5 / medio 1,5-3,0 / alto >3,0 dag/dm3\nB agua quente: baixo <0,3 / medio 0,3-0,9 / alto >0,9 mg/dm3\nZn Mehlich-1: baixo <1,0 / medio 1,0-2,2 / alto >2,2 mg/dm3\nCu Mehlich-1: baixo <0,8 / medio 0,8-1,8 / alto >1,8 mg/dm3\nFe Mehlich-1: baixo <20 / medio 20-45 / alto >45 mg/dm3\nMn Mehlich-1: baixo <5 / medio 5-12 / alto >12 mg/dm3\n\nNIVEIS FOLIARES ADEQUADOS PARA CAFE ARABICA:\nN: 2,90-3,20 dag/kg\nP: 0,16-0,20 dag/kg\nK: 2,22-2,50 dag/kg\nCa: 1,00-1,50 dag/kg\nMg: 0,40-0,45 dag/kg\nS: 0,15-0,20 dag/kg\nFe: 90-180 mg/kg\nZn: 15-20 mg/kg\nB: 50-80 mg/kg\nMn: 80-100 mg/kg\n\nRECOMENDACOES GERAIS:\n- Calagem: usar calcario com PRNT maior ou igual a 90%, aplicar logo apos a colheita\n- Adubacao N e K: 3 aplicacoes parceladas de outubro a marco sob a copa\n- Fosforo: dose unica na pre-florada localizado sob a copa\n- Micronutrientes: via solo conforme analise ou pulverizacao foliar\n- pH ideal 5,5 a 6,0 para maxima disponibilidade de nutrientes\n- pH acima de 6,5 bloqueia absorcao de Fe, Mn, Zn e B\n\nSe houver mais de uma amostra use os valores da primeira ou do horizonte 0-20cm.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples para o produtor incluindo se precisa de calagem quanto de NPK por hectare e quais micronutrientes corrigir\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
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
    else { res.json({ acao: "Nao foi possivel ler o laudo. Verifique a foto e tente novamente.", valores: {} }); }
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
      if (altitude > 900) contextoRegional += " Altitude alta: maior risco de Phoma e Cercosporiose. Temperaturas mais amenas favorecem qualidade do cafe.";
      if (altitude < 600) contextoRegional += " Altitude baixa: maior risco de ferrugem acaro vermelho e broca. Temperaturas mais altas.";
    }
  }

  var introVideo = isVideo ? "Voce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto para um diagnostico mais preciso considerando diferentes angulos.\n\n" : "";

  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia baseado nos trabalhos do Prof. Jose Donizeti Alves (UFLA) e nas normas da Embrapa e Incaper." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO. Pode ser folha OU fruto de cafe.\n\nCONHECIMENTO CLIMATICO IMPORTANTE:\n- Temperatura ideal do arabica: 18-22C. Acima de 34C fotossintese para.\n- Ferrugem: favorecida por umidade alta + temperatura 20-24C + chuvas frequentes + baixa luminosidade.\n- Cercosporiose: favorecida por SOL FORTE + seca + desequilibrio K e Ca. Temperatura 10-25C.\n- Broca e Acaro vermelho: PROLIFERAM em seca e calor. Ciclo de vida acelera com temperatura alta.\n- Bicho-mineiro: favorecido por periodos secos e quentes.\n- Phoma: favorecida por altitude acima de 900m + frio + chuva.\n- Aureolada: favorecida por ventos + chuva + ferimentos + 25-30C.\n- Roseliniose e Mal Rosado: favorecidos por excesso de umidade no solo.\n\nSE FOR FOLHA - CRITERIOS OBRIGATORIOS PARA DIAGNOSTICO PRECISO:\n\nDOENÇAS FUNGICAS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR da folha. Nunca na face superior. Folha cai facilmente.\nbicho=TRILHAS SERPENTINAS castanhas ou galerias vissiveis DENTRO da folha entre as epidermes.\ncercosporiose=manchas CIRCULARES pequenas centro BRANCO-ACINZENTADO halo amarelo FINO e uniforme. Favorecida por sol forte e seca.\nphoma=manchas escuras NECROTICAS irregulares SEM halo amarelo em FOLHAS NOVAS no TOPO da planta. Regioes acima de 900m.\nantracnose=lesoes escuras AFUNDADAS quase pretas necrose bem definida com borda.\nascochyta=manchas marrons claras com centro mais claro bordas irregulares.\nmanteigosa=areas amarelas translucidas como gordura entre as nervuras.\nroseliniose=podridao escura nos ramos e base do caule umidade excessiva.\nhelmintosporiose=manchas grandes irregulares marrons com halos concentricos.\nfusariose=SECA DA COPA DE CIMA PARA BAIXO a partir do ponto de poda. Corte do tronco revela estrias escuras e avermelhadas nos vasos. Cafeeiros VELHOS apos recepa ou decote. Mais grave em Conilon.\n\nDOENCAS BACTERIANAS:\naureolada=manchas pardas GRANDES circundadas por HALO AMARELO GRANDE e irregular. SECA DE RAMOS caracteristica unica que nao ocorre na cercosporiose. Causada por Pseudomonas Syrigae. Favorecida por ventos ferimentos e 25-30C.\n\nDIFERENCAS CRITICAS aureolada vs cercosporiose:\n- Aureolada: halo AMARELO GRANDE irregular + SECA DE RAMOS + bacteria\n- Cercosporiose: centro BRANCO-ACINZENTADO + halo amarelo PEQUENO uniforme + fungo + favorecida por SOL FORTE\n\nDEFICIENCIAS NUTRICIONAIS:\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos morte de apices. Folhas novas moles.\nnitrogenio=folha TODA AMARELA UNIFORME clorose generalizada em folhas VELHAS primeiro. Planta com pouco vigor.\nmagnesio=nervuras VERDES tecido AMARELO internerval clorose entre nervuras folhas VELHAS. Aspecto reticulado verde e amarelo.\npotassio=QUEIMA de bordas e PONTAS folhas VELHAS amarelamento e necrose marginal.\nfosforo=folhas ESCURECIDAS cor verde-escura a preta brilho opaco queda de folhas VELHAS.\ncobre=manchas NECROTICAS folhas pequenas deformadas bordas cloroticas folhas NOVAS.\nmanganes=PONTUACOES ou manchas cloroticas pequenas dispersas folhas NOVAS numerosas.\nboro=folhas NOVAS pequenas QUEBRADICAS DEFORMADAS ponteiros mortos entrenós curtos.\nzinco=folhas NOVAS pequenas ESTREITAS aspecto ROSETA entrenós muito curtos internodios reduzidos.\nferro=folhas NOVAS amarelo-claras a ESBRANQUICADAS NERVURAS VERDES clorose internerval muito intensa. pH alto acima de 6,5 bloqueia ferro.\nenxofre=folhas NOVAS amarelas UNIFORMES com nervuras ligeiramente mais verdes.\nacaro=folha BRONZEADA acinzentada sem brilho aspecto empoeirado face inferior.\nestresse_hidrico=folha MURCHA opaca bordas secas enrolamento. Periodo de seca.\nescaldadura=manchas amarelas ou brancas irregulares no limbo foliar por exposicao excessiva ao sol.\nfitotoxicidade=manchas irregulares necroticas pos aplicacao de agrotoxicos.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR pequeno e preciso no fruto orificio central tipico de Hypothenemus hampei.\nantracnose=lesoes escuras AFUNDADAS necroticas nos frutos Colletotrichum spp.\nfruto_verde=fruto verde saudavel em desenvolvimento normal.\nfruto_maduro=fruto cereja vermelho ou amarelo no ponto ideal de colheita.\nfruto_passado=fruto seco mumificado que passou do ponto ideal de colheita no pe.\n\nREGRAS DE DIAGNOSTICO:\n1. Observe LOCALIZACAO das lesoes: folhas novas vs velhas muda completamente o diagnostico.\n2. Observe FACE da folha: ferrugem SEMPRE na face inferior.\n3. Observe cor EXATA do centro da lesao: branco-acinzentado=cercosporiose alaranjado=ferrugem.\n4. Observe se ha SECA DE RAMOS: presente=aureolada ausente=cercosporiose.\n5. Se houver MULTIPLOS problemas visiveis liste TODOS ate 3 diagnosticos por gravidade.\n6. Considere o contexto climatico e regional para aumentar precisao.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase precisa o sinal visual observado\",\"acao\":\"o que fazer agora em linguagem simples para o produtor rural\",\"fungicidas\":[{\"nome\":\"nome generico do produto\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":1.5,\"dose_max\":2.5,\"unidade\":\"kg|L|mL\",\"por\":\"hectare\",\"proporcao_por_litro\":2.5,\"unidade_proporcao\":\"g|mL\"}]},{\"diagnostico\":\"nome2\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"acao pratica\",\"fungicidas\":[]}]}\n\nREGRAS PARA O CAMPO fungicidas:\n- Doenças fungicas: inclua 1 ou 2 produtos (protetor E sistemico quando indicado)\n- Deficiencias nutricionais: array vazio []\n- Pragas (acaro, broca, bicho): inclua o acaricida ou inseticida indicado com campo tipo correto\n- Planta saudavel: array vazio []\n- proporcao_por_litro e a dose dividida para 1 litro de agua (ex: se dose e 2kg/ha em 200L de calda, proporcao_por_litro = 10)\n- Sempre informe dose_min e dose_max conforme bula padrao Embrapa/Incaper";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});

// ── ROTA PLANTAS DANINHAS ──────────────────────────
app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";

  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira." + contexto + "\n\nAnalise a imagem desta planta daninha encontrada em uma lavoura de cafe e identifique:\n1. O nome popular da planta\n2. O que ela indica sobre o solo\n3. O que o produtor deve fazer\n\nCONHECIMENTO DE PLANTAS DANINHAS INDICADORAS:\nassapeixe=indica solo ACIDO com baixo calcio e magnesio. Corrigir com calcario dolomítico.\nguanxuma=indica solo COMPACTADO. Descompactar com subsolagem e materia organica.\ntiririca=indica solo ACIDO e deficiente em MAGNESIO. Corrigir calcario e sulfato de magnesio.\nbeldroega=indica EXCESSO DE UMIDADE e drenagem ruim. Melhorar drenagem e aeracao.\nfedegoso=indica solo DEGRADADO com baixo CALCIO e materia organica. Calagem e adubacao organica.\ncapim_marmelada=indica solo FERTIL bem estruturado. Sinal positivo mas controlar para nao competir.\ncaruru=indica solo fertil com excesso de NITROGENIO ou materia organica. Revisar adubacao nitrogenada.\npicao_preto=indica solo compactado e com baixo pH. Subsolagem e calcario.\nespinheiro=indica solo seco e degradado.\nmentrasto=indica solo acido com baixo fosforo.\ncordao_frade=indica solo compactado e com excesso de umidade.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"nome\":\"nome popular da planta\",\"nome_cientifico\":\"nome cientifico se souber\",\"indicador\":\"frase curta sobre o que indica no solo\",\"acao\":\"o que fazer para corrigir o problema em linguagem simples para o produtor rural\",\"urgencia\":\"alta|media|baixa\"}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
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
    else { res.json({ nome: "Planta não identificada", indicador: "Não foi possível identificar", acao: "Tente uma foto mais clara da planta inteira.", urgencia: "baixa" }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});
