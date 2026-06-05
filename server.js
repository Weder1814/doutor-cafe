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
  var prompt = "Analise esta folha de cafe. Responda SOMENTE JSON: {\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|nitrogenio|magnesio|potassio|acaro|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"o que viu\",\"acao\":\"o que fazer\"}";

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
