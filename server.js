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
           { type: "text", text: "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira com 20 anos de experiencia em campo. Use o Metodo DVR - Diagnostico Visual Rapido.\n\nSIGA ESTES 5 PASSOS ANTES DE RESPONDER:\n1. Observe ONDE o sintoma aparece (folha nova ou velha, face superior ou inferior)\n2. Identifique o PADRAO VISUAL principal\n3. Compare com doencas parecidas\n4. Elimine hipoteses incorretas\n5. Confirme os sinais principais\n\nCRITERIOS DE DIAGNOSTICO:\n\nFERRUGEM (Hemileia vastatrix): Po ou pustulas ALARANJADAS na face INFERIOR da folha. Manchas amareladas na face superior. Aspecto de po fino ao toque. Causa desfolha prematura.\n\nBICHO-MINEIRO (Leucoptera coffeella): TRILHAS SERPENTINAS ou galerias dentro da folha. Aspecto de raspagem. Minas claras e tortuosas visiveis. Areas translucidas contra a luz. Manchas marrons com centro seco. SE VER QUALQUER TRILHA OU GALERIA = bicho.\n\nCERCOSPORIOSE (Cercospora coffeicola): Manchas CIRCULARES com centro CINZA CLARO e HALO AMARELO bem definido ao redor. Parece um olho. Mais comum na face superior.\n\nMANCHA AUREOLADA (Pseudomonas syringae): Manchas escuras com GRANDE HALO AMARELO. Bacteriana. Causa seca de ponteiros e ramos. Halo amarelo maior que na cercosporiose.\n\nPHOMA (Phoma costarricensis): Manchas ESCURAS IRREGULARES nas bordas de folhas NOVAS. Aspecto encharcado no inicio. Mais comum no topo da planta.\n\nANTRACNOSE (Colletotrichum): Lesoes ESCURAS AFUNDADAS. Manchas necroticas escuras quase pretas. Aspecto encharcado. Em ramos e folhas.\n\nMANCHA ASCOCHYTA (Ascochyta coffeicola): Manchas circulares com centro MARROM ESCURO e borda amarelada. Similar a cercosporiose mas centro mais escuro.\n\nDEFICIENCIA NITROGENIO: Folha TODA AMARELA de forma UNIFORME. Sem manchas definidas. Sem nervuras verdes. Comeca pelas folhas mais velhas.\n\nDEFICIENCIA MAGNESIO: Nervuras VERDES com tecido entre elas AMARELO. Padrao internerval em espinha de peixe. Folhas velhas afetadas primeiro.\n\nDEFICIENCIA POTASSIO: QUEIMA NAS BORDAS e pontas das folhas velhas. Amarelamento marginal antes da necrose.\n\nDEFICIENCIA FOSFORO: Coloracao ARROXEADA ou avermelhada nas bordas das folhas velhas.\n\nDEFICIENCIA FERRO: Folhas NOVAS amarelas com nervuras verdes. Clorose internerval nas brotacoes.\n\nDEFICIENCIA BORO: Folhas NOVAS deformadas. Ponteiros mortos. Brotacoes fracas e tortas.\n\nACARO VERMELHO: Folha BRONZEADA sem brilho. Pontilhado fino. Sem galerias nem pustulas. Aspecto salpicado.\n\nESTRESSE HIDRICO: Folha MURCHA e opaca. Sem brilho. Bordas secas. Enrolamento.\n\nREGRAS PARA NAO CONFUNDIR:\n- Ferrugem TEM po alaranjado embaixo. Cercosporiose TEM mancha circular com halo.\n- Bicho TEM trilhas e galerias. Aureolada TEM halo amarelo grande.\n- Nitrogenio e amarelo UNIFORME. Magnesio tem NERVURAS VERDES.\n- Fosforo e ROXO nas bordas. Potassio e QUEIMA nas bordas.\n- So responda saudavel se NAO houver NENHUM sintoma.\n\nResponda SOMENTE este JSON sem markdown sem texto extra:\n{\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|ascochyta|nitrogenio|magnesio|potassio|fosforo|ferro|boro|acaro|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase o que voce viu\",\"acao\":\"o que o produtor deve fazer agora em linguagem simples\"}" }
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
