const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3001;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.post("/diagnostico", async (req, res) => {
  try {
    const { imagem, mediaType = "image/jpeg" } = req.body;

    if (!imagem) {
      return res.status(400).json({
        erro: "Campo 'imagem' é obrigatório (base64).",
      });
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const base64Data = imagem.replace(/^data:image\/\w+;base64,/, "");

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `Você é um agrônomo especialista em cafeicultura. Analise esta imagem de folha de café e retorne APENAS um JSON válido, sem explicações adicionais, com os seguintes campos:

{
  "diagnostico": "nome da doença ou condição identificada (ex: ferrugem, cercosporiose, mancha-de-phoma, folha saudável, etc.)",
  "estagio": "estágio da doença (inicial, intermediário, avançado) ou 'saudável' se a folha estiver boa",
  "confianca": número entre 0 e 1 representando a confiança no diagnóstico,
  "acao": "recomendação prática e objetiva de manejo ou tratamento"
}

Responda SOMENTE com o JSON, sem markdown, sem backticks, sem texto extra.`,
            },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Strip markdown code fences if model wraps response anyway
    const cleaned = rawText.replace(/(?:json)?|/g, "").trim();

    let resultado;
    try {
      resultado = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        erro: "Resposta da IA não pôde ser interpretada como JSON.",
        resposta_bruta: rawText,
      });
    }

    return res.json(resultado);
  } catch (err) {
    console.error("Erro ao chamar a API Anthropic:", err);

    if (err.status) {
      return res.status(err.status).json({
        erro: err.message || "Erro na API Anthropic.",
        codigo: err.status,
      });
    }

    return res.status(500).json({
      erro: "Erro interno do servidor.",
      detalhe: err.message,
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", servico: "Diagnóstico de Folha de Café" });
});

app.listen(PORT, () => {
  console.log(Servidor rodando na porta ${PORT});
  console.log(POST http://localhost:${PORT}/diagnostico);
});
