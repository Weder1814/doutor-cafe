const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

app.post("/diagnostico", async (req, res) => {
  const { imagem, tipo } = req.body;
  if (!imagem) {
    return res.status(400).json({ erro: "Imagem nao enviada." });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ erro: "Chave da API nao configurada." });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: tipo || "image/jpeg",
                data: imagem
              }
            },
            {
              type: "text",
              text: "Analise esta folha de cafe. Responda SOMENTE JSON: {\"diagnostico\":\"ferrugem|bicho|nitrogenio|magnesio|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"acao\":\"o que fazer\"}"
            }
          ]
        }]
      })
    });
    const data = await response.json();
    const txt = data.content.map(function(b) { return b.text || ""; }).join("");
    const match = txt.match(/\{[\s\S]*?\}/);
    if (!match) {
      return res.status(500).json({ erro: "Resposta invalida." });
    }
    const resultado = JSON.parse(match[0]);
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ erro: "Erro interno." });
  }
});

app.listen(PORT, function() {
  console.log("Doutor Cafe API rodando na porta " + PORT);
});
