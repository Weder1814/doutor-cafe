
var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

// ============ ENDPOINT FOTO ============
app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;

  var prompt = buildPrompt(regiao, altitude, false);

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagem }},
          { type: "text", text: prompt }
        ]
      }]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      res.json(JSON.parse(m[0]));
    } else {
      res.json({ diagnostico: "saudavel", acao: "Nao foi possivel analisar. Tente novamente." });
    }
  })
  .catch(function(e) {
    res.status(500).json({ erro: e.message });
  });
});

// ============ ENDPOINT VIDEO ============
app.post("/diagnostico-video", function(req, res) {
  var frames = req.body.frames;
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;

  if (!frames || frames.length === 0) {
    return res.status(400).json({ erro: "Nenhum frame recebido." });
  }

  var prompt = buildPrompt(regiao, altitude, true);

  // Monta o conteúdo com todos os frames
  var content = [];
  frames.forEach(function(frame, i) {
    content.push({ type: "text", text: "Frame " + (i + 1) + " de " + frames.length + ":" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame }});
  });
  content.push({ type: "text", text: prompt });

  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: content
      }]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      res.json(JSON.parse(m[0]));
    } else {
      res.json({ diagnostico: "saudavel", acao: "Nao foi possivel analisar. Tente novamente." });
    }
  })
  .catch(function(e) {
    res.status(500).json({ erro: e.message });
  });
});

// ============ FUNÇÃO PROMPT ============
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

  var introVideo = isVideo
    ? "Voce recebeu " + "multiplos frames de um video" + " da mesma planta. Analise TODOS os frames em conjunto para um diagnostico mais preciso. Use os diferentes angulos para confirmar ou descartar sintomas.\n\n"
    : "";

  return "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira com 20 anos de experiencia." + contextoRegional + "\n\n" + introVideo + "Analise esta imagem com MAXIMA ATENCAO. Pode ser folha OU fruto de cafe.\n\nSE FOR FOLHA - CRITERIOS OBRIGATORIOS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR.\nbicho=TRILHAS SERPENTINAS ou galerias dentro da folha - SO diagnostique bicho se ver CLARAMENTE as trilhas. ATENCAO: sombras de folha enrolada NAO sao trilhas. Folha enrolada com mancha escura na ponta = Phoma ou Calcio, NUNCA bicho.\ncercosporiose=manchas CIRCULARES PEQUENAS centro cinza halo amarelo FINO uniforme.\naureolada=manchas GRANDES ESCURAS HALO AMARELO GRANDE irregular SECA DE RAMOS.\nphoma=manchas escuras SEM halo grande em FOLHAS NOVAS no TOPO da planta.\nantracnose=lesoes escuras afundadas quase pretas.\nnitrogenio=folha TODA AMARELA uniforme folhas VELHAS.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas VELHAS.\npotassio=QUEIMA bordas e pontas folhas VELHAS.\nfosforo=coloracao ROXA bordas folhas VELHAS.\ncalcio=folhas NOVAS deformadas encurvadas.\nboro=folhas NOVAS pequenas quebradicas ponteiros mortos.\nzinco=folhas NOVAS pequenas estreitas roseta.\nferro=folhas NOVAS esbranquicadas NERVURAS VERDES.\nacaro=folha BRONZEADA sem brilho SEM galerias SEM pustulas.\nestresse_hidrico=folha MURCHA opaca bordas secas.\n\nSE FOR FRUTO:\nbroca=FURO CIRCULAR no fruto.\nfruto_verde=fruto verde saudavel.\nfruto_maduro=fruto cereja pronto colheita.\nfruto_passado=fruto seco apos ponto ideal.\n\nDIFERENCAS CRITICAS:\nPhoma: folha NOVA TOPO mancha escura SEM halo grande.\nAureolada: HALO AMARELO GRANDE IRREGULAR SECA DE RAMOS.\nBicho: OBRIGATORIO ver trilhas serpentinas - sombras NAO sao trilhas.\n\nREGRA DE OURO: Sem evidencia CLARA use confianca BAIXA. NUNCA diagnostique por exclusao.\n\nResponda SOMENTE JSON:\n{\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|ascochyta|manteigosa|roseliniose|helmintosporiose|broca|acaro|acaro_ferrugem|cigarra|cochonilha|lagarta|nematoide|nitrogenio|magnesio|potassio|fosforo|calcio|enxofre|boro|zinco|ferro|manganes|cobre|estresse_hidrico|fitotoxicidade|escaldadura|fruto_verde|fruto_maduro|fruto_passado|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase o principal sinal visual observado\",\"acao\":\"o que o produtor deve fazer agora em linguagem simples e direta\"}";
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor ok");
});
