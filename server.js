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

app.post("/identifica-daninha", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";

  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira." + contexto + "\n\nAnalise a imagem desta planta encontrada em uma lavoura de cafe. Identifique a planta daninha e informe o que ela indica sobre o solo e como controlar.\n\nCONHECIMENTO COMPLETO DE PLANTAS DANINHAS DO CAFE:\n\npicao_preto=Picao-preto (Bidens pilosa). IDENTIFICACAO: flores brancas alongadas centro amarelo, frutos com 2-4 ESPINHOS RIGIDOS que grudam em roupas, folhas compostas com 3-5 foliulos, caule quadrangular. INDICA: solo fertil com materia organica mas atencao pois hospeda pragas e doencas. Sementes duram 5 anos no solo. Maior dano entre outubro e abril. CONTROLE: cobertura do solo com mucuna-preta ou palhada. Quimico pre-emergencia: Flumyzin 500 (150-180ml/ha) ou Ametrina 800 (1,5-2,5kg/ha). Pos-emergencia: Goal BR (6L/ha). Controlar antes do florescimento do cafe.\n\npicao_branco=Picao-branco (Galinsoga parviflora). IDENTIFICACAO: flores minusculas com 5 petals brancas MUITO CURTAS centro amarelo, frutos com PENAS FINAS (papus) NAO grudam em roupas, folhas simples opostas serrilhadas ovais, caule cilindrico ramificado levemente peludo. INDICA: solo fertil com boa materia organica e revolvimento frequente. Solo em boas condicoes. CONTROLE: cobertura do solo com mucuna-preta ou palhada grossa para sufocar germinacao. Arranquio manual antes de florescer. Quimico pre-emergencia: Flumyzin 500 (150-180ml/ha). Pos-emergencia: Goal BR (6L/ha) com jato dirigido ao solo. Sementes viram no solo por ate 5 anos.\n\ncapim_amargoso=Capim-amargoso (Digitaria insularis). INDICA: solo com historico de uso intensivo, se reproduz por rizomas subterraneos e sementes espalhadas pelo vento. CONTROLE: rocar primeiro se ja estiver florescido, aguardar rebrota e aplicar inibidor de ACCase: Cletodim 240 (0,45L/ha) ou Verdict Max 540 (0,2-0,4L/ha) combinado com glifosato + oleo. Resistente ao glifosato isolado.\n\ncapim_pe_de_galinha=Capim-pe-de-galinha (Eleusine indica). INDICA: solo COMPACTADO e com alta temperatura. Produz mais de 120 mil sementes por planta. CONTROLE: controlar com no maximo 1 perfilho. Inibidores de ACCase (Fluazifop, Haloxyfop) + glifosato em pos-emergencia. Inibidores de Protox: Galigan 240 (3L/ha) ou Goal BR (2L/ha). Rotacionar mecanismos de acao para evitar resistencia.\n\nbuva=Buva (Conyza spp.). INDICA: solo com historico de uso de glifosato, RESISTENTE ao glifosato. Produz 200 mil sementes por planta. CONTROLE: aplicar quando planta tiver menos de 25cm. Herbicidas: Oxyfluorfen Galigan 240EC (3L/ha), Carfentrazona Aurora 400EC, Saflufenacil Heat 700WG. Cobertura com braquiaria nas entrelinhas reduz infestacao.\n\ncaruru=Caruru (Amaranthus spp.). INDICA: solo fertil com excesso de NITROGENIO. ATENCAO: hospedeiro do nematoide Meloidogyne que ataca raizes do cafe. CONTROLE: arranquio manual antes de produzir sementes. Quimico: Saflufenacil Heat 700WG em plantas com ate 5cm. Manter solo coberto.\n\ntiririca=Tiririca (Cyperus rotundus). INDICA: solo ACIDO com deficiencia de MAGNESIO e calcio. Se reproduce por tuberculos subterraneos. CONTROLE: arar e gradar para expor tuberculos ao sol antes do plantio. Herbicidas: glifosato + Diuron Nortox 800WP com jato dirigido. Halosulfuron, imazapic e imazapir tambem eficazes. Pulverizacao sequencial essencial.\n\nassapeixe=Assa-peixe. INDICA: solo ACIDO com baixo calcio e magnesio. CONTROLE: calagem com calcario dolomítico, corrigir pH para 5,5-6,0.\n\nguanxuma=Guanxuma. INDICA: solo COMPACTADO. CONTROLE: subsolagem mecanica e adicao de materia organica.\n\nbeldroega=Beldroega. INDICA: EXCESSO DE UMIDADE e drenagem deficiente. CONTROLE: melhorar drenagem do solo.\n\nfedegoso=Fedegoso. INDICA: solo DEGRADADO com baixo calcio e materia organica. CONTROLE: calagem e adubacao organica.\n\ncapim_marmelada=Capim-marmelada. INDICA: solo FERTIL bem estruturado. Sinal POSITIVO mas controlar competicao.\n\ncorda_de_viola=Corda-de-viola (Ipomoea spp.). INDICA: manejo inadequado de daninhas. Trepadeira que PREJUDICA A COLHEITA. CONTROLE: iniciar no comeco das chuvas. Herbicidas: glifosato, 2,4-D, Carfentrazona Aurora 400EC, Metsulfurom Ally 600WG. Se ja cobrir os cafeeiros fazer arranquio cuidadoso sem puxar forte.\n\nbraquiaria=Braquiaria (Brachiaria spp.). INDICA: pode ser BOA nas entrelinhas ou PROBLEMA na linha do cafe. Manter distancia minima de 1 metro da saia do cafeeiro. CONTROLE na linha: inibidores de ACCase, mesmos do capim-amargoso. Rocar regularmente.\n\npoaia_branca=Poaia-branca (Richardia brasiliensis). INDICA: solo quente e fertil, hospedeira de pragas e doencas. CONTROLE: cobertura morta ou viva nas entrelinhas. Herbicidas direcionados na linha.\n\nREGRA DE DESEMPATE PICOES: Se a planta tem flores com petals brancas CURTAS (menos de 3mm) e frutos com PENAS FINAS que NAO grudam em roupas = classificar OBRIGATORIAMENTE como picao_branco (Galinsoga parviflora). Se tem petals brancas ALONGADAS e frutos com ESPINHOS RIGIDOS que grudam = classificar como picao_preto (Bidens pilosa). NUNCA confundir as duas especies.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"nome\":\"nome popular da planta\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"frase curta sobre o que indica no solo ou na lavoura\",\"acao\":\"instrucoes completas de controle em linguagem simples para o produtor rural incluindo produtos recomendados com doses quando aplicavel\",\"urgencia\":\"alta|media|baixa\",\"tipo_controle\":\"quimico|mecanico|cultural|integrado\"}";

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
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
    else { res.json({ nome: "Planta nao identificada", nome_cientifico: "", indicador: "Nao foi possivel identificar", acao: "Tente uma foto mais clara da planta inteira com folhas visiveis.", urgencia: "baixa", tipo_controle: "nenhum" }); }
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

  var introVideo = isVideo ? "Voce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto para um diagnostico mais preciso considerando diferentes angulos.\n\n" : "";

  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia baseado nos trabalhos do Prof. Jose Donizeti Alves (UFLA) e nas normas da Embrapa e Incaper." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO. Pode ser folha OU fruto de cafe.\n\nCONHECIMENTO CLIMATICO IMPORTANTE:\n- Temperatura ideal do arabica: 18-22C. Acima de 34C fotossintese para.\n- Ferrugem: favorecida por umidade alta + temperatura 20-24C + chuvas frequentes + baixa luminosidade.\n- Cercosporiose: favorecida por SOL FORTE + seca + desequilibrio K e Ca. Temperatura 10-25C.\n- Broca e Acaro vermelho: PROLIFERAM em seca e calor.\n- Bicho-mineiro: favorecido por periodos secos e quentes.\n- Phoma: favorecida por altitude acima de 900m + frio + chuva.\n- Aureolada: favorecida por ventos + chuva + ferimentos + 25-30C.\n\nDOENÇAS FUNGICAS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR da folha.\nbicho=TRILHAS SERPENTINAS castanhas ou galerias visiveis DENTRO da folha.\ncercosporiose=manchas CIRCULARES pequenas centro BRANCO-ACINZENTADO halo amarelo FINO.\nphoma=manchas escuras NECROTICAS irregulares SEM halo amarelo em FOLHAS NOVAS no TOPO.\nantracnose=lesoes escuras AFUNDADAS quase pretas necrose bem definida.\nascochyta=manchas marrons claras com centro mais claro bordas irregulares.\nmanteigosa=areas amarelas translucidas como gordura entre as nervuras.\nroseliniose=podridao escura nos ramos e base do caule.\nhelmintosporiose=manchas grandes irregulares marrons com halos concentricos.\nfusariose=SECA DA COPA DE CIMA PARA BAIXO a partir do ponto de poda.\n\nDOENCAS BACTERIANAS:\naureolada=manchas pardas GRANDES circundadas por HALO AMARELO GRANDE e irregular. SECA DE RAMOS.\n\nDEFICIENCIAS NUTRICIONAIS:\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\nnitrogenio=folha TODA AMARELA UNIFORME clorose generalizada em folhas VELHAS.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas VELHAS.\npotassio=QUEIMA de bordas e PONTAS folhas VELHAS amarelamento e necrose marginal.\nfosforo=folhas ESCURECIDAS cor verde-escura a preta brilho opaco.\ncobre=manchas NECROTICAS folhas pequenas deformadas bordas cloroticas folhas NOVAS.\nmanganes=PONTUACOES ou manchas cloroticas pequenas dispersas folhas NOVAS.\nboro=folhas NOVAS pequenas QUEBRADICAS DEFORMADAS ponteiros mortos.\nzinco=folhas NOVAS pequenas ESTREITAS aspecto ROSETA entrenós muito curtos.\nferro=folhas NOVAS amarelo-claras a ESBRANQUICADAS NERVURAS VERDES clorose internerval.\nenxofre=folhas NOVAS amarelas UNIFORMES com nervuras ligeiramente mais verdes.\nacaro=folha BRONZEADA acinzentada sem brilho aspecto empoeirado face inferior.\nestresse_hidrico=folha MURCHA opaca bordas secas enrolamento.\nescaldadura=manchas amarelas ou brancas irregulares no limbo foliar.\nfitotoxicidade=manchas irregulares necroticas pos aplicacao de agrotoxicos.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR pequeno e preciso no fruto.\nantracnose=lesoes escuras AFUNDADAS necroticas nos frutos.\nfruto_verde=fruto verde saudavel em desenvolvimento.\nfruto_maduro=fruto cereja no ponto ideal de colheita.\nfruto_passado=fruto seco mumificado passou do ponto.\n\nPRODUTOS E DOSES POR DIAGNOSTICO (base Embrapa/Incaper):\nferrugem: fungicida sistemico Tebuconazol 200SC (0,75-1,0L/ha a cada 21 dias) OU Epoxiconazol+Carbendazim (0,5-0,75L/ha). Preventivo: Oxicloreto de Cobre 840WP (2,0-2,5kg/ha).\ncercosporiose: Oxicloreto de Cobre 840WP (2,0-2,5kg/ha) OU Tebuconazol (0,75-1,0L/ha). Intervalo 21 dias.\nphoma: Tiofanato Metilico 700WP (1,0-1,5kg/ha) OU Procimidona (1,0L/ha). Aplicar preventivo antes das chuvas em regioes altas.\nantracnose: Azoxistrobina+Difenoconazol (0,3L/ha) OU Tiofanato Metilico (1,0kg/ha).\nascochyta: Cobre (Oxicloreto 2,0kg/ha) + Mancozebe (2,0kg/ha) tanque mix.\nbicho: Inseticida Thiamethoxam 250WG (0,1-0,2kg/ha) OU Imidacloprido (0,3-0,5L/ha).\nbroca: Inseticida Clorpirifos 480EC (1,5-2,0L/ha) OU controle biologico Beauveria bassiana (1,0kg/ha).\nacaro: Acaricida Abamectina 18EC (0,5-0,75L/ha) OU Enxofre 800WP (3,0-4,0kg/ha).\ncochonilha: Clorpirifos 480EC (1,5L/ha) OU Imidacloprido (0,5L/ha) via solo.\nfusariose: Sem controle quimico eficaz. Eliminar partes afetadas e desinfetar ferramentas com hipoclorito.\naureolada: Bactericida Cobre (Oxicloreto 2,5kg/ha) OU Mancozebe+Cobre. Nao ha bactericida especifico registrado.\n\nREGRAS DE DIAGNOSTICO:\n1. Observe LOCALIZACAO: folhas novas vs velhas muda completamente o diagnostico.\n2. Ferrugem SEMPRE na face inferior.\n3. Centro branco-acinzentado=cercosporiose, alaranjado=ferrugem.\n4. SECA DE RAMOS=aureolada, sem seca=cercosporiose.\n5. Liste TODOS os problemas visiveis ate 3 diagnosticos.\n6. Considere contexto climatico e regional.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase precisa o sinal visual observado\",\"acao\":\"o que fazer agora em linguagem simples para o produtor rural\",\"fungicidas\":[{\"nome\":\"nome generico do produto\",\"nome_comercial\":\"exemplo de marca comercial\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":1.5,\"dose_max\":2.5,\"unidade\":\"kg|L|mL\",\"por\":\"hectare\",\"proporcao_por_litro\":2.5,\"unidade_proporcao\":\"g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]},{\"diagnostico\":\"nome2\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"acao pratica\",\"fungicidas\":[]}]}\n\nREGRAS PARA fungicidas:\n- Doencas fungicas e bacterianas: inclua 1 ou 2 produtos com doses reais\n- Pragas (acaro broca bicho cochonilha): inclua o inseticida ou acaricida correto\n- Deficiencias nutricionais: array vazio []\n- Planta saudavel: array vazio []\n- proporcao_por_litro = dose_min dividida pelo volume medio de calda (200L/ha) = dose por litro de agua\n- intervalo_reaplicacao em dias\n- carencia_dias = dias de carencia antes da colheita conforme bula\n- Sempre informe dose_min e dose_max conforme bula padrao Embrapa/Incaper\n- nome_comercial = exemplo de produto registrado no Brasil";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor Doutor Cafe ok");
});
