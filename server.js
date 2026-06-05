const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.json({ status: "online", app: "Doutor Cafe API" });
});

app.post("/diagnostico", async (req, res) => {
  const { imagem, tipo } = req.body;
  const KEY = process.env.ANTHROPIC_API_KEY;
  
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
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
            { type: "image", source: { type: "base64", media_type: tipo || "image/jpeg", data: imagem }},
            { type: "text", text: "Analise esta folha de cafe. Responda SOMENTE este JSON exato sem mais nada: {\"diagnostico\":\"ferrugem\",\"acao\":\"o que fazer\"}" }
          ]
        }]
      })
    });
    
    const d = await r.json();
    console.log("API response:", JSON.stringify(d).substring(0, 200));
    
    if (d.content && d.content[0] && d.content[0].text) {
      const txt = d.content[0].text;
      const m = txt.match(/\{[^}]+\}/);
      if (m) return res.json(JSON.parse(m[0]));
    }
    
    return res.json({ diagnostico: "saudavel", acao: "Nao foi possivel analisar. Tente novamente." });
    
  } catch(e) {
    console.log("Erro:", e.message);
    return res.status(500).json({ erro: e.message });
  }
});

app.listen(process.env.PORT || 8080, () => console.log("Servidor ok"));
