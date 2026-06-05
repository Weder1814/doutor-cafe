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
            { type: "text", text: "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira. Analise CUIDADOSAMENTE esta foto de folha decafe. Responda SOMENTE este JSON sem mais nada: {\"diagnostico\":\"ferrugem|bicho|nitrogenio|magnesio|saudavel\",\"acao\":\"o que o produtor deve fazer agora\"} CRITERIOS: ferrugem=po alaranjado embaixo da folha. bicho=trilhas ou galerias dentro da folha aspecto de raspagem. nitrogenio=folha toda amarela uniforme. magnesio=nervuras verdes tecido entre elas amarelo. saudavel verde escuro sem problemas.SE HOUVER TRILHAS OU GALERIAS NA FOLHA = bicho." }
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
