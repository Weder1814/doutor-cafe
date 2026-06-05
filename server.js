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
  var KEY = process.env.ANTHROPIC_API_KEY;
  var prompt =  "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira. Analise esta folha com MAXIMA ATENCAO. Responda SOMENTE JSON sem texto extra: {\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|nitrogenio|magnesio|potassio|fosforo|calcio|boro|zinco|ferro|acaro|estresse_hidrico|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"o que viu na folha\",\"acao\":\"o que fazer agora em linguagem simples\"} CRITERIOS OBRIGATORIOS: ferrugem=po ou pustulas ALARANJADAS na face INFERIOR da folha. bicho=TRILHAS SERPENTINAS ou galerias dentro da folha aspecto raspagem minas claras. cercosporiose=manchas CIRCULARES PEQUENAS centro cinza-claro halo amarelo FINO bem definido face inferior. aureolada=manchas GRANDES ESCURAS centro marrom-escuro HALO AMARELO GRANDE irregular bacteriana SECA PONTEIROS E RAMOS. phoma=manchas escuras irregulares bordas folhas novas topo planta. antracnose=lesoes escuras afundadas quase pretas necrose. nitrogenio=folha TODA AMARELA uniforme folhas velhas primeiro. magnesio=nervuras VERDES tecido entre elas AMARELO internerval folhas velhas. potassio=QUEIMA bordas e pontas folhas velhas. fosforo=coloracao ROXA avermelhada bordas folhas velhas. calcio=folhas NOVAS deformadas encurvadas ponteiros mortos. boro=folhas NOVAS pequenas quebradicas ponteiros mortos cabeleira brotos. zinco=folhas NOVAS pequenas estreitas encarquilhadas roseta. ferro=folhas NOVAS amarelo-claras esbranquicadas NERVURAS VERDES solos alcalinos. acaro=folha BRONZEADA salpicada sem brilho sem galerias sem pustulas. estresse_hidrico=folha MURCHA opaca sem brilho bordas secas. saudavel=verde escuro uniforme sem nenhum problema. DIFERENCAS IMPORTANTES: aureolada TEM halo amarelo GRANDE e IRREGULAR e causa seca de ramos. cercosporiose TEM halo amarelo PEQUENO e UNIFORME circular. SE HALO GRANDE E SECA DE RAMOS = aureolada. SE MANCHA CIRCULAR PEQUENA = cercosporiose.";
  fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 300,
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
      res.json({ diagnostico: "saudavel", acao: "Tente novamente." });
    }
  })
  .catch(function(e) {
    res.status(500).json({ erro: e.message });
  });
});

app.listen(process.env.PORT || 8080, function() {
  console.log("Servidor ok");
});
