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
    const prompt = "Voce e o Doutor Cafe, especialista em cafeicultura brasileira. Analise esta folha e responda SOMENTE este JSON sem texto extra: {\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|nitrogenio|magnesio|potassio|fosforo|calcio|boro|zinco|ferro|acaro|estresse_hidrico|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"o que voce viu na folha\",\"acao\":\"o que o produtor deve fazer agora\"} CRITERIOS: ferrugem=po alaranjado embaixo da folha. bicho=trilhas ou galerias dentro da folha. cercosporiose=mancha circular centro cinza halo amarelo. aureolada=mancha escura halo amarelo grande. phoma=manchas escuras bordas folhas novas. antracnose=lesoes escuras afundadas. nitrogenio=folha toda amarela uniforme. magnesio=nervuras verdes tecido amarelo. potassio=queima nas bordas. fosforo=roxo nas bordas. calcio=folhas novas deformadas. boro=ponteiros mortos folhas novas quebradicas. zinco=folhas novas pequenas encarquilhadas. ferro=folhas novas esbranquicadas nervuras verdes. acaro=folha bronzeada salpicada. estresse_hidrico=folha murcha sem brilho. saudavel=sem problemas.";

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
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const d = await r.json();
    const txt = d.content && d.content[0] ? d.content[0].text : "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return res.json(JSON.parse(m[0]));
    return res.json({ diagnostico: "saudavel", acao: "Nao foi possivel analisar. Tente novamente." });

  } catch(e) {
    return res.status(500).json({ erro: e.message });
  }
});

app.listen(process.env.PORT || 8080, () => console.log("Servidor ok porta " + (process.env.PORT || 8080)));
