
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.json({ status: "online", app: "Doutor Cafe API", versao: "1.0.0" });
});

app.post("/diagnostico", async (req, res) => {
  console.log("Recebendo requisicao de diagnostico...");
  
  const { imagem, tipo } = req.body;
  
  if (!imagem) {
    console.log("Erro: imagem nao enviada");
    return res.status(400).json({ erro: "Imagem nao enviada." });
  }
  
  if (!ANTHROPIC_API_KEY) {
    console.log("Erro: chave da API nao configurada");
    return res.status(500).json({ erro: "Chave da API nao configurada." });
  }

  console.log("Chamando API da Anthropic...");

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
        max_tokens: 300,
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
              text: "Voce e o Doutor Cafe, especialista em cafeicultura brasileira. Analise esta folha de cafe. Responda SOMENTE com JSON sem markdown: {\"diagnostico\":\"ferrugem|bicho|nitrogenio|magnesio|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"acao\":\"o que o produtor deve fazer agora em linguagem simples\"}"
            }
          ]
        }]
      })
    });

    const data = await response.json();
    console.log("Resposta da API recebida");
    
    const txt = data.content && data.content[0] ? data.content[0].text : "";
    const match = txt.match(/\{[\s\S]*?\}/);
    
    if (!match) {
      console.log("Erro: resposta invalida da IA:", txt);
      return res.status(500).json({ erro: "Resposta invalida da IA." });
    }
    
    const resultado = JSON.parse(match[0]);
    console.log("Diagnostico:", resultado.diagnostico);
    return res.json(resultado);
    
  } catch (err) {
    console.log("Erro interno:", err.message);
    return res.status(500).json({ erro: "Erro interno: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log("Doutor Cafe API rodando na porta " + PORT);
});
