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
           
      { type: "text", text: "Voce e o Doutor Cafe, fitopatologista especialista em cafeicultura brasileira com 20 anos de experiencia em campo. Use o Metodo DVR - Diagnostico Visual Rapido.\n\nSIGA ESTES 5 PASSOS:\n1. Observe ONDE o sintoma aparece (folha nova ou velha, face superior ou inferior, parte da planta)\n2. Identifique o PADRAO VISUAL principal (mancha, amarelamento, galeria, deformacao)\n3. Compare com doencas parecidas usando os criterios abaixo\n4. Elimine hipoteses incorretas\n5. Confirme os sinais principais antes de responder\n\nDOENÇAS FUNGICAS:\n- FERRUGEM (Hemileia vastatrix): Po ou pustulas ALARANJADAS na face INFERIOR. Manchas amareladas face superior. Aspecto po fino. Desfolha prematura. Pior em epoca chuvosa 18-22C.\n- CERCOSPORIOSE (Cercospora coffeicola): Manchas CIRCULARES centro CINZA CLARO com HALO AMARELO definido. Parece um olho de pombo. Face superior. Piora com deficiencia nutricional.\n- PHOMA (Phoma costarricensis): Manchas ESCURAS IRREGULARES nas bordas de folhas NOVAS. Aspecto encharcado. Topo da planta. Regioes acima 900m altitude.\n- ANTRACNOSE (Colletotrichum): Lesoes ESCURAS AFUNDADAS quase pretas. Manchas necroticas. Ramos e folhas. Alta umidade.\n- MANCHA ASCOCHYTA (Ascochyta coffeicola): Manchas circulares CENTRO MARROM ESCURO borda amarelada. Similar cercosporiose mas centro mais escuro.\n- MANCHA MANTEIGOSA (Colletotrichum gloeosporioides): Manchas AMARELADAS OLEO aspecto manteigoso face superior. Folhas maduras. Evolui para necrose escura.\n- ROSELINIOSE (Rosellinia necatrix): Amarelecimento e seca de RAMOS. Micelio branco nas raizes. Sem cura - planta deve ser eliminada. Solos acidos.\n- HELMINTOSPORIOSE (Helminthosporium): Pontos cloroticos amarelos que viram marrom-avermelhados. Lesoes com centro claro e halo avermelhado.\n\nDOENÇAS BACTERIANAS:\n- MANCHA AUREOLADA (Pseudomonas syringae): Manchas escuras HALO AMARELO GRANDE ao redor. Bacteriana. Causa seca de PONTEIROS e RAMOS. Halo maior que cercosporiose. Ferimentos favorecem.\n\nPRAGAS:\n- BICHO-MINEIRO (Leucoptera coffeella): TRILHAS SERPENTINAS ou galerias dentro da folha. Aspecto de raspagem. Minas claras e tortuosas. Areas translucidas contra luz. Manchas marrons centro seco. SE VER TRILHA OU GALERIA = bicho.\n- BROCA DO CAFE (Hypothenemus hampei): Furos circulares nos FRUTOS. Po fino na saida. Graos brocados preto-ardosia. Nao aparece nas folhas.\n- ACARO VERMELHO (Oligonychus ilicis): Folha BRONZEADA sem brilho. Pontilhado fino amarelado. Teias finas face inferior. Sem galerias nem pustulas. Aspecto salpicado.\n- ACARO FERRUGEM FALSA (Brevipalpus): Bronzeamento marrom-avermelhado. Face inferior. Sem teias visiveis.\n- CIGARRA (Quesada gigas): Dano nas RAIZES e RAMOS. Furos no solo. Inseto grande preto com asas transparentes. Som caracteristico.\n- COCHONILHA ROSETA (Planococcus): Colonia ALGODONOSA BRANCA na roseta axilas e ramos. Melada brilhante. Formigas associadas. Fumagina preta.\n- LAGARTA ROSETA: Lagartas marrom-claras com listras. Fios de seda. Destroi flores e frutos novos.\n- NEMATOIDE GALHAS (Meloidogyne): Galhas nas RAIZES. Planta fraca amarelada murcha. Sintoma vem das raizes. Solos arenosos.\n\nDEFICIENCIAS NUTRICIONAIS:\n- NITROGENIO (N): Folha TODA AMARELA UNIFORME. Sem manchas definidas. Comeca folhas velhas. Planta fraca pequena.\n- MAGNESIO (Mg): Nervuras VERDES tecido entre elas AMARELO. Padrao internerval espinha de peixe. Folhas velhas primeiro.\n- POTASSIO (K): QUEIMA NAS BORDAS e pontas folhas velhas. Amarelamento marginal antes da necrose. Enrolamento das bordas.\n- FOSFORO (P): Coloracao ARROXEADA ou avermelhada nas bordas folhas velhas. Verde-escuro azulado inicial.\n- CALCIO (Ca): Folhas NOVAS deformadas encurvadas bordas irregulares. Morte de ponteiros. Crescimento travado.\n- MAGNESIO (Mg): Nervuras verdes tecido amarelo internerval.\n- ENXOFRE (S): Folhas NOVAS amarelas UNIFORME nervuras verdes. Similar nitrogenio mas nas folhas novas.\n- BORO (B): Folhas NOVAS deformadas pequenas quebradicas. Ponteiros mortos cabeleira de brotos. Entrenós curtos.\n- ZINCO (Zn): Folhas novas PEQUENAS ESTREITAS encarquilhadas. Aspecto de roseta. Entrenós curtos.\n- FERRO (Fe): Folhas NOVAS amarelo-claras ESBRANQUICADAS nervuras verdes. Clorose internerval brotacoes. Solos alcalinos.\n- MANGANES (Mn): Folhas novas amareladas entre nervuras. Nervuras verdes. Similar ferro mas menos intenso.\n- COBRE (Cu): Clorose bordas e apice folhas novas. Folhas enroladas retorcidas. Morte ponteiros.\n\nOUTROS:\n- ESTRESSE HIDRICO: Folha MURCHA opaca sem brilho. Bordas secas. Enrolamento. Periodo seco.\n- FITOTOXICIDADE: Queima uniforme APOS APLICACAO de defensivo. Manchas sem padrao biologico. Surge em horas.\n- ESCALDADURA: Manchas secas areas expostas ao SOL FORTE. Sem agente biologico.\n\nREGRAS PARA NAO CONFUNDIR:\n- Ferrugem TEM po alaranjado embaixo. Cercosporiose TEM mancha circular com halo amarelo.\n- Bicho TEM trilhas e galerias. Aureolada TEM halo amarelo grande e seca ramos.\n- Nitrogenio e UNIFORME nas velhas. Enxofre e UNIFORME nas novas. Ferro e INTERNERVAL nas novas.\n- Magnesio e INTERNERVAL nas velhas. Zinco e ROSETA nas novas.\n- Fosforo e ROXO nas bordas velhas. Potassio e QUEIMA nas bordas velhas.\n- Calcio e DEFORMACAO nas novas. Boro e PONTEIRO MORTO.\n- So responda saudavel se NAO houver NENHUM sintoma visivel.\n\nResponda SOMENTE este JSON sem markdown sem texto extra:\n{\"diagnostico\":\"ferrugem|bicho|cercosporiose|aureolada|phoma|antracnose|ascochyta|manteigosa|roseliniose|helmintosporiose|broca|acaro|acaro_ferrugem|cigarra|cochonilha|lagarta|nematoide|nitrogenio|magnesio|potassio|fosforo|calcio|enxofre|boro|zinco|ferro|manganes|cobre|estresse_hidrico|fitotoxicidade|escaldadura|saudavel\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"descreva em 1 frase o que voce viu na folha\",\"acao\":\"o que o produtor deve fazer agora em linguagem simples e direta\"}" }
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
