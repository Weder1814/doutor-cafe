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
           
      
    { type: "text", text: "Voce e o Doutor Cafe, especialista em cafeicultura brasileira.\n\nAnalise esta folha e responda SOMENTE este JSON:\n{\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|nitrogenio|magnesio|potassio|fosforo|calcio|boro|zinco|ferro|acaro|estresse_hidrico|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"o que voce viu\",\"acao\":\"o que fazer agora\"}\n\nCRITERIOS:\nferrugem=po alaranjado embaixo da folha\nbicho=trilhas ou galerias dentro da folha\ncercosporiose=mancha circular centro cinza halo amarelo\naureolada=mancha escura halo amarelo grande seca ramos\nphoma=manchas escuras bordas folhas novas\nantracnose=lesoes escuras afundadas quase pretas\nnitrogenio=folha toda amarela uniforme folhas velhas\nmagnesio=nervuras verdes tecido amarelo entre elas\npotassio=queima nas bordas folhas velhas\nfosforo=coloracao roxa bordas folhas velhas\ncalcio=folhas novas deformadas ponteiros mortos\nboro=folhas novas pequenas quebradicas ponteiros mortos\nzinco=folhas novas pequenas encarquilhadas roseta\nferro=folhas novas esbranquicadas nervuras verdes\nacaro=folha bronzeada salpicada sem galerias\nestresse_hidrico=folha murcha sem brilho bordas secas\nsaudavel=verde escuro uniforme sem problemas" }
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
