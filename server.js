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
      model: "claude-opus-4-5",
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
    else { res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente." }] }); }
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
    body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 800, messages: [{ role: "user", content: content }] })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) { res.json(JSON.parse(m[0])); }
    else { res.json({ diagnosticos: [{ diagnostico: "saudavel", estagio: 1, confianca: "media", visto: "", acao: "Nao foi possivel analisar. Tente novamente." }] }); }
  })
  .catch(function(e) { res.status(500).json({ erro: e.message }); });
});

app.post("/analise-solo", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var KEY = process.env.ANTHROPIC_API_KEY;
  var contexto = regiao ? " O produtor esta na regiao " + regiao + "." : "";
  var prompt = "Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira." + contexto + "\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nPARAMETROS IDEAIS PARA CAFE ARABICA:\npH CaCl2: 5.5 a 6.0\nMateria Organica: acima de 3%\nFosforo P: acima de 20 mg/dm3\nPotassio K: acima de 3.0 mmolc/dm3\nCalcio Ca: acima de 15 mmolc/dm3\nMagnesio Mg: acima de 5 mmolc/dm3\nSaturacao de Bases V%: acima de 50%\nBoro B: acima de 0.5 mg/dm3\nZinco Zn: acima de 1.5 mg/dm3\n\nSe houver mais de uma amostra use os valores da primeira.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples para o produtor incluindo se precisa de calagem e quanto de NPK por hectare\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-opus-4-5",
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
      "Cerrado Mineiro": "solos acidos com deficiencia frequente de Calcio, Magnesio e Boro. Alta incidencia de ferrugem em anos umidos.",
      "Sul de Minas": "altitudes acima de 800m favorecem Phoma e Cercosporiose. Solos com boa fertilidade mas risco de deficiencia de Zinco.",
      "Mogiana": "regiao quente com risco de acaro vermelho em periodos secos. Deficiencia de Potassio comum.",
      "Matas de Minas": "alta umidade favorece ferrugem e bicho-mineiro. Solos com deficiencia de Fosforo e Magnesio.",
      "Chapada Diamantina": "altitude elevada favorece Phoma. Solos rasos com deficiencia de Nitrogenio e Boro.",
      "Planalto da Bahia": "clima seco favorece acaro e estresse hidrico. Deficiencia de Ferro em solos alcalinos.",
      "Rondonia": "alta umidade e temperatura favorecem ferrugem e antracnose. Solos acidos com deficiencia de Calcio.",
      "Norte do Parana": "geadas podem causar fitotoxicidade. Solos ferteis mas risco de deficiencia de Manganes.",
      "Espirito Santo": "cafeeiros conillon predominantes. Alta umidade favorece cercosporiose e cochonilha.",
      "Alta Paulista": "clima quente e seco favorece acaro vermelho. Deficiencia de Zinco frequente."
    };
    var info = deficienciasRegiao[regiao] || "regiao cafeeira brasileira.";
    contextoRegional = "\n\nCONTEXTO REGIONAL: Produtor na regiao " + regiao + ". " + info;
    if (altitude) {
      contextoRegional += " Altitude: " + altitude + "m.";
      if (altitude > 900) contextoRegional += " Altitude alta aumenta risco de Phoma.";
      if (altitude < 600) contextoRegional += " Altitude baixa aumenta risco de ferrugem e acaro.";
    }
  }
  var introVideo = isVideo ? "Voce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto para um diagnostico mais preciso.\n\n" : "";

  return "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira com 20 anos de experiencia." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO. Pode ser folha OU fruto de cafe.\n\nSE FOR FOLHA - CRITERIOS OBRIGATORIOS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR.\nbicho=TRILHAS SERPENTINAS ou galerias dentro da folha.\ncercosporiose=manchas CIRCULARES PEQUENAS centro cinza halo amarelo FINO uniforme.\naureolada=manchas GRANDES ESCURAS HALO AMARELO GRANDE irregular SECA DE RAMOS.\nphoma=manchas escuras necroticas SEM halo grande em FOLHAS NOVAS no TOPO da planta.\nantracnose=lesoes escuras afundadas quase pretas necrose definida.\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos morte de apices.\nnitrogenio=folha TODA AMARELA UNIFORME clorose em folhas VELHAS primeiro.\nmagnesio=nervuras VERDES tecido AMARELO internerval clorose entre nervuras folhas VELHAS.\npotassio=QUEIMA bordas e PONTAS folhas VELHAS amarelamento marginal.\nfosforo=folhas ESCURECIDAS cor verde-escura a preta brilho opaco folhas VELHAS.\ncobre=manchas NECROTICAS folhas pequenas deformadas bordas cloroticas folhas NOVAS.\nmanganes=PONTUACOES ou manchas cloroticas pequenas dispersas folhas NOVAS.\nboro=folhas NOVAS pequenas QUEBRADICAS DEFORMADAS ponteiros mortos.\nzinco=folhas NOVAS pequenas ESTREITAS aspecto ROSETA entrenós curtos.\nferro=folhas NOVAS amarelo-claras a ESBRANQUICADAS NERVURAS VERDES clorose internerval intensa.\nenxofre=folhas NOVAS amarelas UNIFORMES com nervuras verdes.\nmolibdenio=AMARELAMENTO nas MARGENS das folhas velhas.\nniquel=NECROSE DO APICE folhas novas ponta da folha morre primeiro.\nacaro=folha BRONZEADA acinzentada sem brilho.\nestresse_hidrico=folha MURCHA opaca bordas secas enrolamento.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR no fruto orificio central.\nantracnose=lesoes escuras AFUNDADAS necroticas nos frutos.\nfruto_verde=fruto verde saudavel.\nfruto_maduro=fruto cereja vermelho ou amarelo pronto colheita.\nfruto_passado=fruto seco mumificado apos ponto ideal.\n\nIMPORTANTE: Se houver MULTIPLOS problemas visiveis na imagem, liste TODOS. Retorne ate 3 diagnosticos ordenados por gravidade.\n\nResponda SOMENTE JSON:\n{\"diagnosticos\":[{\"diagnostico\":\"nome\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase o sinal visual\",\"acao\":\"o que fazer agora em linguagem simples\"},{\"diagnostico\":\"nome2\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"acao\"}]}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor ok");
});
