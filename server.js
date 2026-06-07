var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", function(req, res) {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

app.post("/diagnostico", function(req, res) {
  var imagem = req.body.imagem;
  var tipo = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  var KEY = process.env.ANTHROPIC_API_KEY;

  // Contexto regional dinâmico
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
    contextoRegional = "\n\nCONTEXTO REGIONAL IMPORTANTE: O produtor esta na regiao " + regiao + ". Caracteristicas: " + info;
    if (altitude) {
      contextoRegional += " Altitude aproximada: " + altitude + "m.";
      if (altitude > 900) contextoRegional += " Altitude acima de 900m aumenta risco de Phoma.";
      if (altitude < 600) contextoRegional += " Altitude baixa aumenta risco de ferrugem e acaro.";
    }
    contextoRegional += " Considere essas caracteristicas regionais ao diagnosticar deficiencias nutricionais e doenças.";
  }

  var prompt = "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira com 20 anos de experiencia." + contextoRegional + "\n\nAnalise esta imagem com MAXIMA ATENCAO. Pode ser folha OU fruto de cafe.\n\nSE FOR FOLHA - CRITERIOS OBRIGATORIOS:\nferrugem=po ou pustulas ALARANJADAS na face INFERIOR.\nbicho=TRILHAS SERPENTINAS ou galerias dentro da folha.\ncercosporiose=manchas CIRCULARES PEQUENAS centro cinza halo amarelo FINO uniforme.\naureolada=manchas GRANDES ESCURAS HALO AMARELO GRANDE irregular SECA DE RAMOS - SE HALO GRANDE E SECA RAMOS = aureolada.\nphoma=manchas escuras SEM halo grande em FOLHAS NOVAS no TOPO da planta - SE FOLHA NOVA TOPO SEM HALO = phoma NAO aureolada.\nantracnose=lesoes escuras afundadas quase pretas.\nnitrogenio=folha TODA AMARELA uniforme folhas VELHAS.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas VELHAS.\npotassio=QUEIMA bordas e pontas folhas VELHAS.\nfosforo=coloracao ROXA bordas folhas VELHAS.\ncalcio=folhas NOVAS deformadas encurvadas.\nboro=folhas NOVAS pequenas quebradicas ponteiros mortos.\nzinco=folhas NOVAS pequenas estreitas roseta.\nferro=folhas NOVAS esbranquicadas NERVURAS VERDES.\nacaro=folha BRONZEADA sem brilho SEM galerias SEM pustulas.\nestresse_hidrico=folha MURCHA opaca bordas secas.\n\nSE FOR FRUTO - CRITERIOS:\nbroca=FURO CIRCULAR no fruto orificio central po fino.\nantracnose=lesoes escuras afundadas no fruto.\nfruto_verde=fruto verde sem problema aparente.\nfruto_maduro=fruto cereja vermelho ou amarelo pronto colheita.\nfruto_passado=fruto seco passa escuro apos ponto ideal.\n\nDIFERENCAS CRITICAS PHOMA vs AUREOLADA:\nPhoma: folha NOVA no TOPO, mancha escura SEM halo amarelo grande.\nAureolada: qualquer folha, HALO AMARELO GRANDE IRREGULAR, SECA DE RAMOS.\nSE nao tem halo grande e esta no topo em folha nova = PHOMA.\nSE tem halo grande e seca ramos = AUREOLADA.\n\nResponda SOMENTE JSON sem texto extra:\n{\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|ascochyta|manteigosa|roseliniose|helmintosporiose|broca|acaro|acaro_ferrugem|cigarra|cochonilha|lagarta|nematoide|nitrogenio|magnesio|potassio|fosforo|calcio|enxofre|boro|zinco|ferro|manganes|cobre|estresse_hidrico|fitotoxicidade|escaldadura|fruto_verde|fruto_maduro|fruto_passado|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase o principal sinal visual observado\",\"acao\":\"o que o produtor deve fazer agora em linguagem simples e direta\"}";

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

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor ok");
});
