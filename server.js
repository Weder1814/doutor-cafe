var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── VARIÁVEIS DE AMBIENTE ──────────────────────────────────────
var MP_TOKEN   = process.env.MP_ACCESS_TOKEN;
var BASE_URL   = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";
var DB_URL     = process.env.DATABASE_URL;
var KEY        = process.env.ANTHROPIC_API_KEY;

// ── POSTGRESQL ─────────────────────────────────────────────────
var Pool = null;
var pool = null;

if (DB_URL) {
  try {
    Pool = require("pg").Pool;
    pool = new Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    console.log("✅ PostgreSQL conectado");
  } catch(e) {
    console.warn("⚠️ pg não instalado — usando memória:", e.message);
  }
} else {
  console.warn("⚠️ DATABASE_URL não definida — usando memória");
}

var usuariosMemoria = {};

// ── VALIDAÇÃO CPF ─────────────────────────────────────────────
function validarCPF(cpf) {
  cpf = cpf.replace(/[^0-9]/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  var soma = 0;
  for (var i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  var dig1 = 11 - (soma % 11);
  if (dig1 >= 10) dig1 = 0;
  if (dig1 !== parseInt(cpf[9])) return false;
  soma = 0;
  for (var i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  var dig2 = 11 - (soma % 11);
  if (dig2 >= 10) dig2 = 0;
  if (dig2 !== parseInt(cpf[10])) return false;
  return true;
}

// ── LIMITES DE ANÁLISES ───────────────────────────────────────
var LIMITES = {
  gratuito: 15,
  basico:   130,
  pro:      250,
  premium:  400
};

// ── LIMITE SEPARADO PARA VIDEO (custa ~2x uma foto: 4 frames analisados) ──
var VIDEO_LIMITES = {
  gratuito: 2,
  basico:   10,
  pro:      25,
  premium:  50
};

function mesAtual() {
  var agora = new Date();
  return agora.getFullYear() + "-" + String(agora.getMonth() + 1).padStart(2, "0");
}

function analisesRestantes(u) {
  var plano = u.plano || "gratuito";
  var limite = LIMITES[plano] || 15;
  var usadas = u.analises_usadas || u.analisesUsadas || 0;
  if (plano === "gratuito") {
    return Math.max(0, limite - usadas);
  } else {
    var mesReset = u.mes_reset || u.mesReset || "";
    if (mesReset !== mesAtual()) return limite;
    return Math.max(0, limite - usadas);
  }
}

function videosRestantes(u) {
  var plano = u.plano || "gratuito";
  var limite = VIDEO_LIMITES[plano] || 2;
  var usados = u.videos_usados || u.videosUsados || 0;
  if (plano === "gratuito") {
    return Math.max(0, limite - usados);
  } else {
    var mesReset = u.mes_reset || u.mesReset || "";
    if (mesReset !== mesAtual()) return limite;
    return Math.max(0, limite - usados);
  }
}

// ── INICIALIZAR TABELAS ────────────────────────────────────────
async function initDB() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        user_id       TEXT PRIMARY KEY,
        cpf           TEXT,
        celular       TEXT,
        nome          TEXT,
        pin           TEXT,
        email         TEXT,
        regiao        TEXT,
        plano         TEXT DEFAULT 'gratuito',
        plano_id      TEXT,
        analises_usadas INTEGER DEFAULT 0,
        videos_usados INTEGER DEFAULT 0,
        mes_reset     TEXT DEFAULT '',
        criado_em     TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_usuarios_celular ON usuarios(celular);
      CREATE INDEX IF NOT EXISTS idx_usuarios_cpf ON usuarios(cpf);

      CREATE TABLE IF NOT EXISTS analises (
        id           SERIAL PRIMARY KEY,
        user_id      TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
        talhao_id    TEXT,
        diagnosticos JSONB,
        foto_thumb   TEXT,
        regiao       TEXT,
        criado_em    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analises_user ON analises(user_id);
      CREATE INDEX IF NOT EXISTS idx_analises_talhao ON analises(talhao_id);

      CREATE TABLE IF NOT EXISTS uso_api (
        id                    SERIAL PRIMARY KEY,
        user_id               TEXT,
        tipo                  TEXT,
        modelo                TEXT,
        regiao                TEXT,
        input_tokens          INTEGER,
        output_tokens         INTEGER,
        cache_creation_tokens INTEGER,
        cache_read_tokens     INTEGER,
        custo_usd_est         NUMERIC(10,6),
        criado_em             TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uso_api_user ON uso_api(user_id);
      CREATE INDEX IF NOT EXISTS idx_uso_api_criado ON uso_api(criado_em);

      CREATE TABLE IF NOT EXISTS talhoes (
        id            TEXT PRIMARY KEY,
        user_id       TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
        nome          TEXT,
        variedade     TEXT,
        idade         INTEGER,
        area          NUMERIC,
        analises      JSONB DEFAULT '[]',
        criado_em     TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_talhoes_user ON talhoes(user_id);

      CREATE TABLE IF NOT EXISTS pagamentos (
        id        TEXT PRIMARY KEY,
        user_id   TEXT,
        plano_id  TEXT,
        status    TEXT,
        valor     NUMERIC,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mes_reset TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS videos_usados INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS assinatura_status TEXT`);
    console.log("✅ Tabelas PostgreSQL inicializadas");
  } catch(e) {
    console.error("❌ Erro ao inicializar tabelas:", e.message);
  }
}

// ── HELPERS DB ────────────────────────────────────────────────
async function dbGetUser(userId) {
  if (pool) {
    try {
      var r = await pool.query("SELECT * FROM usuarios WHERE user_id=$1", [userId]);
      return r.rows[0] || null;
    } catch(e) { console.error("dbGetUser:", e.message); }
  }
  return usuariosMemoria[userId] || null;
}

async function dbGetUserByCelular(celular) {
  var cel = celular.replace(/[^0-9]/g,"");
  if (pool) {
    try {
      var r = await pool.query("SELECT * FROM usuarios WHERE REGEXP_REPLACE(celular,'[^0-9]','','g')=$1", [cel]);
      return r.rows[0] || null;
    } catch(e) {
      try {
        var r2 = await pool.query("SELECT * FROM usuarios WHERE celular=$1", [cel]);
        return r2.rows[0] || null;
      } catch(e2) { console.error("dbGetUserByCelular:", e2.message); }
    }
  }
  return Object.values(usuariosMemoria).find(function(u){ return (u.celular||"").replace(/[^0-9]/g,"")===cel; }) || null;
}

async function dbGetUserByCPF(cpf) {
  var c = cpf.replace(/[^0-9]/g,"");
  if (pool) {
    try {
      var r = await pool.query("SELECT * FROM usuarios WHERE REGEXP_REPLACE(cpf,'[^0-9]','','g')=$1", [c]);
      return r.rows[0] || null;
    } catch(e) {
      try {
        var r2 = await pool.query("SELECT * FROM usuarios WHERE cpf=$1", [c]);
        return r2.rows[0] || null;
      } catch(e2) { console.error("dbGetUserByCPF:", e2.message); }
    }
  }
  return Object.values(usuariosMemoria).find(function(u){ return (u.cpf||"").replace(/[^0-9]/g,"")===c; }) || null;
}

// ── NOVO: buscar usuário apenas pelo PIN ──────────────────────
async function dbGetUserByPin(pin) {
  if (pool) {
    try {
      var r = await pool.query("SELECT * FROM usuarios WHERE pin=$1 LIMIT 1", [pin]);
      return r.rows[0] || null;
    } catch(e) { console.error("dbGetUserByPin:", e.message); }
  }
  return Object.values(usuariosMemoria).find(function(u){ return u.pin === pin; }) || null;
}

async function dbSaveUser(u) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO usuarios (user_id,cpf,celular,nome,pin,email,regiao,plano,analises_usadas,mes_reset)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (user_id) DO UPDATE SET
          cpf=EXCLUDED.cpf, celular=EXCLUDED.celular, nome=EXCLUDED.nome,
          pin=EXCLUDED.pin, email=EXCLUDED.email, regiao=EXCLUDED.regiao,
          plano=EXCLUDED.plano, analises_usadas=EXCLUDED.analises_usadas,
          mes_reset=EXCLUDED.mes_reset, atualizado_em=NOW()
      `, [u.userId||u.user_id, u.cpf||"", u.celular||"", u.nome||"",
          u.pin||"", u.email||"", u.regiao||"", u.plano||"gratuito",
          u.analisesUsadas||0, u.mesReset||""]);
      return true;
    } catch(e) { console.error("dbSaveUser:", e.message); }
  }
  usuariosMemoria[u.userId||u.user_id] = u;
  return true;
}

async function dbIncrementarAnalise(userId) {
  var mes = mesAtual();
  if (pool) {
    try {
      var r = await pool.query("SELECT plano, mes_reset FROM usuarios WHERE user_id=$1", [userId]);
      if (r.rows.length > 0) {
        var u = r.rows[0];
        var plano = u.plano || "gratuito";
        var mesReset = u.mes_reset || "";
        if (plano !== "gratuito" && mesReset !== mes) {
          await pool.query(
            "UPDATE usuarios SET analises_usadas=1, mes_reset=$2, atualizado_em=NOW() WHERE user_id=$1",
            [userId, mes]
          );
        } else {
          await pool.query(
            "UPDATE usuarios SET analises_usadas=analises_usadas+1, mes_reset=$2, atualizado_em=NOW() WHERE user_id=$1",
            [userId, plano === "gratuito" ? mesReset : mes]
          );
        }
      }
      return true;
    } catch(e) { console.error("dbIncrementarAnalise:", e.message); }
  }
  if (usuariosMemoria[userId]) {
    var u = usuariosMemoria[userId];
    var plano = u.plano || "gratuito";
    if (plano !== "gratuito" && (u.mesReset||"") !== mes) {
      u.analisesUsadas = 1; u.mesReset = mes;
    } else {
      u.analisesUsadas = (u.analisesUsadas||0) + 1;
      if (plano !== "gratuito") u.mesReset = mes;
    }
  }
  return true;
}

// ── INCREMENTAR CONTADOR DE VIDEO (sub-limite dentro do limite total) ──
// IMPORTANTE: chamar SEMPRE depois de dbIncrementarAnalise() na mesma analise de
// video, para que o reset mensal (mes_reset) ja tenha sido aplicado e o contador
// de video nao fique "preso" a um mes anterior.
async function dbIncrementarVideo(userId) {
  var mes = mesAtual();
  if (pool) {
    try {
      var r = await pool.query("SELECT plano, mes_reset, videos_usados FROM usuarios WHERE user_id=$1", [userId]);
      if (r.rows.length > 0) {
        var u = r.rows[0];
        var plano = u.plano || "gratuito";
        var mesReset = u.mes_reset || "";
        if (plano !== "gratuito" && mesReset !== mes) {
          await pool.query(
            "UPDATE usuarios SET videos_usados=1, mes_reset=$2, atualizado_em=NOW() WHERE user_id=$1",
            [userId, mes]
          );
        } else {
          await pool.query(
            "UPDATE usuarios SET videos_usados=videos_usados+1, atualizado_em=NOW() WHERE user_id=$1",
            [userId]
          );
        }
      }
      return true;
    } catch(e) { console.error("dbIncrementarVideo:", e.message); }
  }
  if (usuariosMemoria[userId]) {
    var u = usuariosMemoria[userId];
    var plano = u.plano || "gratuito";
    if (plano !== "gratuito" && (u.mesReset||"") !== mes) {
      u.videosUsados = 1; u.mesReset = mes;
    } else {
      u.videosUsados = (u.videosUsados||0) + 1;
    }
  }
  return true;
}

async function dbAtualizarPlano(userId, plano, planoId) {
  var mes = mesAtual();
  if (pool) {
    try {
      await pool.query(
        "UPDATE usuarios SET plano=$2, plano_id=$3, analises_usadas=0, mes_reset=$4, atualizado_em=NOW() WHERE user_id=$1",
        [userId, plano, planoId||"", mes]
      );
      return true;
    } catch(e) { console.error("dbAtualizarPlano:", e.message); }
  }
  if (usuariosMemoria[userId]) {
    usuariosMemoria[userId].plano = plano;
    usuariosMemoria[userId].planoId = planoId;
    usuariosMemoria[userId].analisesUsadas = 0;
    usuariosMemoria[userId].mesReset = mes;
  }
  return true;
}

// Atualiza plano + guarda o id da assinatura recorrente (preapproval) e seu status.
// Usado pelo fluxo de assinatura via Card Payment Brick (sem redirect pro MP).
async function dbAtualizarAssinatura(userId, plano, planoId, preapprovalId, status) {
  var mes = mesAtual();
  if (pool) {
    try {
      await pool.query(
        "UPDATE usuarios SET plano=$2, plano_id=$3, analises_usadas=0, mes_reset=$4, mp_preapproval_id=$5, assinatura_status=$6, atualizado_em=NOW() WHERE user_id=$1",
        [userId, plano, planoId||"", mes, preapprovalId||null, status||null]
      );
      return true;
    } catch(e) { console.error("dbAtualizarAssinatura:", e.message); }
  }
  if (usuariosMemoria[userId]) {
    usuariosMemoria[userId].plano = plano;
    usuariosMemoria[userId].planoId = planoId;
    usuariosMemoria[userId].analisesUsadas = 0;
    usuariosMemoria[userId].mesReset = mes;
    usuariosMemoria[userId].mpPreapprovalId = preapprovalId;
    usuariosMemoria[userId].assinaturaStatus = status;
  }
  return true;
}

async function dbSalvarAnalise(userId, talhaoId, diagnosticos, fotoThumb, regiao) {
  if (pool) {
    try {
      await pool.query(
        "INSERT INTO analises (user_id,talhao_id,diagnosticos,foto_thumb,regiao) VALUES ($1,$2,$3,$4,$5)",
        [userId, talhaoId||null, JSON.stringify(diagnosticos), fotoThumb||"", regiao||""]
      );
      return true;
    } catch(e) { console.error("dbSalvarAnalise:", e.message); }
  }
  return true;
}

// ── CUSTO REAL POR ANALISE (a partir do usage retornado pela API) ──────
// Precos por milhao de tokens (USD), Junho/2026. Atualize se a Anthropic mudar a tabela.
var PRECOS_USD_POR_MTOK = {
  "claude-sonnet-4-6":          { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5-20251001":  { input: 0.80,  output: 4.00  }
};

function calcularCustoUSD(modelo, usage) {
  if (!usage) return null;
  var precos = PRECOS_USD_POR_MTOK[modelo];
  if (!precos) return null;
  var inputTok   = usage.input_tokens || 0;
  var outputTok  = usage.output_tokens || 0;
  var cacheWrite = usage.cache_creation_input_tokens || 0;
  var cacheRead  = usage.cache_read_input_tokens || 0;
  // cache write custa 1.25x o input normal; cache read custa 0.1x o input normal
  var custo =
    (inputTok   / 1e6) * precos.input +
    (cacheWrite / 1e6) * precos.input * 1.25 +
    (cacheRead  / 1e6) * precos.input * 0.10 +
    (outputTok  / 1e6) * precos.output;
  return custo;
}

// Loga o uso real (tokens + custo estimado) de uma analise no banco.
// Chamar sempre que a API Anthropic responder, passando o objeto "usage" cru
// retornado por ela. Nao quebra o fluxo principal se falhar (best-effort).
async function logUsoAnalise(userId, tipo, modelo, usage, regiao) {
  if (!pool) return;
  try {
    var custo = calcularCustoUSD(modelo, usage);
    await pool.query(
      `INSERT INTO uso_api (user_id, tipo, modelo, regiao,
         input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, custo_usd_est)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId||"anonimo", tipo, modelo, regiao||"",
        usage ? (usage.input_tokens||0) : null,
        usage ? (usage.output_tokens||0) : null,
        usage ? (usage.cache_creation_input_tokens||0) : null,
        usage ? (usage.cache_read_input_tokens||0) : null,
        custo
      ]
    );
  } catch(e) { console.error("logUsoAnalise:", e.message); }
}

// ── RATE LIMITING ──────────────────────────────────────────────
var rateMap = {};
var RATE_LIMIT_ANALISE = 10;
var RATE_LIMIT_JANELA  = 60 * 1000;

function checkRateLimit(userId) {
  var agora = Date.now();
  if (!rateMap[userId] || agora > rateMap[userId].resetAt) {
    rateMap[userId] = { count: 1, resetAt: agora + RATE_LIMIT_JANELA };
    return true;
  }
  rateMap[userId].count++;
  if (rateMap[userId].count > RATE_LIMIT_ANALISE) return false;
  return true;
}

setInterval(function() {
  var agora = Date.now();
  Object.keys(rateMap).forEach(function(k){ if (agora > rateMap[k].resetAt) delete rateMap[k]; });
}, 5 * 60 * 1000);

// ── PLANOS ────────────────────────────────────────────────────
var PLANOS = {
  basico_mensal:  { nome:"Básico Mensal",  valor:29.90,  analises:130, preapproval_plan_id: process.env.MP_PLAN_ID_BASICO },
  basico_anual:   { nome:"Básico Anual",   valor:299.90, analises:130 },
  pro_mensal:     { nome:"Pro Mensal",     valor:39.90,  analises:250, preapproval_plan_id: process.env.MP_PLAN_ID_PRO },
  pro_anual:      { nome:"Pro Anual",      valor:399.90, analises:250 },
  premium_mensal: { nome:"Premium Mensal", valor:49.90,  analises:400, preapproval_plan_id: process.env.MP_PLAN_ID_PREMIUM },
  premium_anual:  { nome:"Premium Anual",  valor:499.90, analises:400 }
};
// Nota: só os planos MENSAIS viram assinatura recorrente (preapproval) via Card Payment
// Brick, sem sair do app. Os ANUAIS continuam usando /gerar-pix (PIX) ou podem ser
// migrados depois pra preapproval anual também, se preferir.

// ── ENDPOINTS BÁSICOS ─────────────────────────────────────────
app.get("/", function(req, res) { res.json({ status:"online", app:"Doutor Cafe API", db: pool?"postgres":"memoria" }); });
app.get("/ping", function(req, res) { res.json({ ok:true, ts:Date.now() }); });

// ── PREÇO DO CAFÉ (Coffee C via Alpha Vantage — API oficial) ───
// Requer variavel de ambiente ALPHAVANTAGE_API_KEY no Railway (gratis em
// alphavantage.co). Cache de 4h para respeitar limite de 25 chamadas/dia
// do plano gratuito (2 chamadas por atualizacao: cafe + cambio).
var ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_API_KEY;
var _cachePrecoCafe = { data: null, timestamp: 0 };
var CACHE_PRECO_MS = 4 * 60 * 60 * 1000; // 4 horas
app.get("/preco-cafe", async function(req, res) {
  var agora = Date.now();
  if (_cachePrecoCafe.data && (agora - _cachePrecoCafe.timestamp) < CACHE_PRECO_MS) {
    return res.json(_cachePrecoCafe.data);
  }
  if (!ALPHAVANTAGE_KEY) {
    console.error("ERRO /preco-cafe: ALPHAVANTAGE_API_KEY nao configurada no Railway");
    return res.status(503).json({ erro: "indisponivel" });
  }
  try {
    var [rCafe, rCambio] = await Promise.all([
      fetch("https://www.alphavantage.co/query?function=COFFEE&interval=daily&apikey=" + ALPHAVANTAGE_KEY),
      fetch("https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=BRL&apikey=" + ALPHAVANTAGE_KEY)
    ]);
    var dCafe = await rCafe.json();
    var dCambio = await rCambio.json();

    if (dCafe.Note || dCafe.Information) throw new Error("Alpha Vantage limite/aviso: " + (dCafe.Note || dCafe.Information));
    if (dCambio.Note || dCambio.Information) throw new Error("Alpha Vantage limite/aviso (cambio): " + (dCambio.Note || dCambio.Information));

    var serie = dCafe.data;
    if (!serie || serie.length < 2) throw new Error("Serie de cafe vazia ou insuficiente");
    // A API retorna do mais recente para o mais antigo; pula valores nulos/vazios (".")
    var pontosValidos = serie.filter(function(p){ return p.value && p.value !== "."; });
    if (pontosValidos.length < 2) throw new Error("Sem pontos validos suficientes na serie");
    var precoAtual = parseFloat(pontosValidos[0].value);
    var precoAnterior = parseFloat(pontosValidos[1].value);

    var taxaCambio = dCambio["Realtime Currency Exchange Rate"];
    var dolar = taxaCambio && parseFloat(taxaCambio["5. Exchange Rate"]);
    if (isNaN(precoAtual) || isNaN(precoAnterior) || !dolar || isNaN(dolar)) throw new Error("Campos de preco/cambio invalidos");

    var pontos = precoAtual - precoAnterior;
    var pct = (pontos / precoAnterior) * 100;
    // 1 saca = 60kg = 132.277 lb. Preco NY em centavos de USD/lb.
    var precoSacaEstimado = (precoAtual / 100) * 132.277 * dolar;

    var resultado = {
      preco_ny_centavos_lb: Math.round(precoAtual * 100) / 100,
      variacao_pontos: Math.round(pontos * 100) / 100,
      variacao_pct: Math.round(pct * 100) / 100,
      dolar: Math.round(dolar * 100) / 100,
      preco_saca_estimado_reais: Math.round(precoSacaEstimado * 100) / 100,
      data_referencia: pontosValidos[0].date,
      atualizado_em: new Date().toISOString(),
      stale: false
    };
    _cachePrecoCafe = { data: resultado, timestamp: agora };
    res.json(resultado);
  } catch (e) {
    console.error("ERRO /preco-cafe:", e.message);
    if (_cachePrecoCafe.data) {
      res.json(Object.assign({}, _cachePrecoCafe.data, { stale: true }));
    } else {
      res.status(503).json({ erro: "indisponivel" });
    }
  }
});

// ── CADASTRAR USUÁRIO ─────────────────────────────────────────
app.post("/cadastrar-usuario", async function(req, res) {
  var userId  = req.body.userId;
  var nome    = req.body.nome;
  var celular = (req.body.celular||"").replace(/[^0-9]/g,"");
  var cpf     = (req.body.cpf||"").replace(/[^0-9]/g,"");
  var regiao  = req.body.regiao||"";
  var email   = req.body.email||"";
  var pin     = (req.body.pin||"").replace(/[^0-9]/g,"").substr(0,4);

  if (!userId || !nome) return res.status(400).json({ erro:"Nome obrigatorio." });

  if (cpf && !validarCPF(cpf)) {
    return res.status(400).json({ erro:"CPF inválido. Verifique os números digitados." });
  }

  try {
    // 1. Esse user_id (mesmo dispositivo) ja tem cadastro? So atualiza perfil,
    //    NUNCA reseta uso/plano — isso e o que causava o contador "pulando".
    var jaTemEsseId = await dbGetUser(userId);
    if (jaTemEsseId) {
      await dbSaveUser({
        userId: userId,
        cpf: cpf || jaTemEsseId.cpf || "",
        celular: celular || jaTemEsseId.celular || "",
        nome: nome,
        pin: pin || jaTemEsseId.pin || "",
        email: email || jaTemEsseId.email || "",
        regiao: regiao || jaTemEsseId.regiao || "",
        plano: jaTemEsseId.plano || "gratuito",
        analisesUsadas: jaTemEsseId.analises_usadas || jaTemEsseId.analisesUsadas || 0,
        mesReset: jaTemEsseId.mes_reset || jaTemEsseId.mesReset || ""
      });
      return res.json({
        ok:true, userId:userId, jaExistia:true,
        plano: jaTemEsseId.plano||"gratuito",
        analisesUsadas: jaTemEsseId.analises_usadas||jaTemEsseId.analisesUsadas||0,
        analisesRestantes: analisesRestantes(jaTemEsseId)
      });
    }

    // 2. Existe outra conta com esse CPF ou celular? (evita duplicata quando o
    //    id local do dispositivo muda, ex: cache limpo, reinstalacao)
    var existente = null;
    if (cpf) { try { existente = await dbGetUserByCPF(cpf); } catch(e) { console.error("verificarCPF:", e.message); } }
    if (!existente && celular) { try { existente = await dbGetUserByCelular(celular); } catch(e) { console.error("verificarCelular:", e.message); } }
    if (existente) {
      return res.json({
        ok:true,
        userId: existente.user_id||existente.userId,
        jaExistia:true,
        plano: existente.plano||"gratuito",
        analisesUsadas: existente.analises_usadas||existente.analisesUsadas||0,
        analisesRestantes: analisesRestantes(existente)
      });
    }

    // 3. Usuario genuinamente novo — so aqui comeca com 0 analises usadas.
    await dbSaveUser({ userId, cpf, celular, nome, pin, email, regiao, plano:"gratuito", analisesUsadas:0, mesReset:"" });
    res.json({ ok:true, userId, analisesRestantes: LIMITES.gratuito });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── LOGIN CELULAR + PIN (mantido para compatibilidade) ────────
app.post("/entrar", async function(req, res) {
  var celular = (req.body.celular||"").replace(/[^0-9]/g,"");
  var pin     = (req.body.pin||"").replace(/[^0-9]/g,"");

  if (!celular || celular.length < 10) return res.status(400).json({ erro:"Celular invalido." });
  if (!pin || pin.length !== 4) return res.status(400).json({ erro:"PIN deve ter 4 digitos." });

  try {
    var u = await dbGetUserByCelular(celular);
    if (!u) return res.status(404).json({ erro:"Celular nao encontrado. Faca o cadastro." });
    if (u.pin && u.pin !== pin) return res.status(401).json({ erro:"PIN incorreto." });

    var restantes = analisesRestantes(u);
    res.json({
      ok:true,
      userId: u.user_id||u.userId,
      nome: u.nome,
      celular: u.celular,
      email: u.email,
      regiao: u.regiao,
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0,
      analisesRestantes: restantes
    });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── NOVO: LOGIN APENAS POR PIN ────────────────────────────────
app.post("/entrar-pin", async function(req, res) {
  var pin = (req.body.pin||"").replace(/[^0-9]/g,"");

  if (!pin || pin.length !== 4) return res.status(400).json({ erro:"PIN deve ter 4 digitos." });

  try {
    var u = await dbGetUserByPin(pin);
    if (!u) return res.status(404).json({ erro:"PIN nao encontrado. Verifique ou faca o cadastro." });

    var restantes = analisesRestantes(u);
    res.json({
      ok:true,
      userId: u.user_id||u.userId,
      nome: u.nome,
      celular: u.celular,
      email: u.email,
      regiao: u.regiao,
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0,
      analisesRestantes: restantes
    });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── VERIFICAR ANÁLISES RESTANTES ──────────────────────────────
app.get("/analises-restantes/:userId", async function(req, res) {
  try {
    var u = await dbGetUser(req.params.userId);
    if (!u) return res.status(404).json({ erro:"Usuario nao encontrado." });
    var restantes = analisesRestantes(u);
    res.json({
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0,
      analisesRestantes: restantes,
      limite: LIMITES[u.plano||"gratuito"]||15,
      videosUsados: u.videos_usados||u.videosUsados||0,
      videosRestantes: videosRestantes(u),
      limiteVideo: VIDEO_LIMITES[u.plano||"gratuito"]||2
    });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── INCREMENTAR ANÁLISE ───────────────────────────────────────
app.post("/incrementar-analise", async function(req, res) {
  var userId = req.body.userId;
  if (!userId) return res.json({ ok:true });
  var u = await dbGetUser(userId);
  if (u && analisesRestantes(u) <= 0) {
    return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
  }
  await dbIncrementarAnalise(userId);
  res.json({ ok:true });
});

// ── INCREMENTAR VIDEO (sub-limite) ──────────────────────────────
// Chamar DEPOIS de /incrementar-analise (ou /salvar-analise) na mesma analise
// de video, nessa ordem, para o reset mensal funcionar corretamente.
app.post("/incrementar-video", async function(req, res) {
  var userId = req.body.userId;
  if (!userId) return res.json({ ok:true });
  var u = await dbGetUser(userId);
  if (u && videosRestantes(u) <= 0) {
    return res.status(403).json({ erro:"Limite de videos do plano atingido neste mes.", semVideos:true });
  }
  await dbIncrementarVideo(userId);
  res.json({ ok:true });
});

// ── SALVAR ANÁLISE NO SERVIDOR ────────────────────────────────
app.post("/salvar-analise", async function(req, res) {
  var userId      = req.body.userId;
  var talhaoId    = req.body.talhaoId;
  var diagnosticos= req.body.diagnosticos||[];
  var fotoThumb   = req.body.fotoThumb||"";
  var regiao      = req.body.regiao||"";
  if (!userId) return res.status(400).json({ erro:"userId obrigatorio" });
  try {
    await dbSalvarAnalise(userId, talhaoId, diagnosticos, fotoThumb, regiao);
    await dbIncrementarAnalise(userId);
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── SALVAR/ATUALIZAR TALHÃO ───────────────────────────────────
app.post("/salvar-talhao", async function(req, res) {
  var userId  = req.body.userId;
  var talhao  = req.body.talhao;
  if (!userId || !talhao) return res.status(400).json({ erro:"userId e talhao obrigatorios" });
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO talhoes (id,user_id,nome,variedade,idade,area,analises)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          nome=EXCLUDED.nome, variedade=EXCLUDED.variedade,
          idade=EXCLUDED.idade, area=EXCLUDED.area,
          analises=EXCLUDED.analises, atualizado_em=NOW()
      `, [talhao.id, userId, talhao.nome, talhao.variedade||"",
          talhao.idade||null, talhao.area||null, JSON.stringify(talhao.analises||[])]);
      res.json({ ok:true });
    } catch(e) { res.status(500).json({ erro:e.message }); }
  } else {
    res.json({ ok:true, aviso:"sem banco de dados" });
  }
});

// ── BUSCAR TALHÕES DO USUÁRIO ─────────────────────────────────
app.get("/talhoes/:userId", async function(req, res) {
  var userId = req.params.userId;
  if (pool) {
    try {
      var r = await pool.query("SELECT * FROM talhoes WHERE user_id=$1 ORDER BY criado_em ASC", [userId]);
      res.json({ talhoes: r.rows.map(function(t){
        return { id:t.id, nome:t.nome, variedade:t.variedade, idade:t.idade, area:t.area, analises:t.analises||[], criadoEm:t.criado_em };
      })});
    } catch(e) { res.status(500).json({ erro:e.message }); }
  } else {
    res.json({ talhoes:[], aviso:"sem banco de dados" });
  }
});

// ── BUSCAR HISTÓRICO DO USUÁRIO ───────────────────────────────
app.get("/historico/:userId", async function(req, res) {
  var userId = req.params.userId;
  var limit  = parseInt(req.query.limit)||20;
  if (pool) {
    try {
      var r = await pool.query(
        "SELECT id,talhao_id,diagnosticos,regiao,criado_em FROM analises WHERE user_id=$1 ORDER BY criado_em DESC LIMIT $2",
        [userId, limit]
      );
      res.json({ analises: r.rows });
    } catch(e) { res.status(500).json({ erro:e.message }); }
  } else {
    res.json({ analises:[] });
  }
});

// ── ADMIN: LISTAR USUÁRIOS ────────────────────────────────────
app.get("/usuarios", async function(req, res) {
  if (req.query.senha !== "doutorcafe2026") return res.status(401).json({ erro:"Nao autorizado" });
  try {
    if (pool) {
      var r = await pool.query("SELECT user_id,nome,celular,email,regiao,plano,analises_usadas,mes_reset,criado_em FROM usuarios ORDER BY criado_em DESC");
      return res.json({ total:r.rows.length, usuarios:r.rows });
    }
    res.json({ total:Object.keys(usuariosMemoria).length, usuarios:Object.values(usuariosMemoria) });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── ADMIN: RELATORIO DE CUSTO REAL DA API ──────────────────────
// Mostra custo estimado por tipo de analise, total geral, e ranking de
// usuarios que mais geram custo. Use ?dias=30 para mudar a janela (padrao 30).
app.get("/custo-api", async function(req, res) {
  if (req.query.senha !== "doutorcafe2026") return res.status(401).json({ erro:"Nao autorizado" });
  if (!pool) return res.json({ erro:"Sem banco de dados conectado." });
  try {
    var dias = parseInt(req.query.dias) || 30;
    var porTipo = await pool.query(
      `SELECT tipo, modelo, COUNT(*) as qtd,
              SUM(input_tokens) as input_total, SUM(output_tokens) as output_total,
              SUM(cache_creation_tokens) as cache_write_total, SUM(cache_read_tokens) as cache_read_total,
              ROUND(SUM(custo_usd_est)::numeric, 4) as custo_total_usd,
              ROUND(AVG(custo_usd_est)::numeric, 5) as custo_medio_usd
       FROM uso_api
       WHERE criado_em >= NOW() - ($1 || ' days')::interval
       GROUP BY tipo, modelo ORDER BY custo_total_usd DESC`,
      [dias]
    );
    var totalGeral = await pool.query(
      `SELECT COUNT(*) as total_analises, ROUND(SUM(custo_usd_est)::numeric, 4) as custo_total_usd
       FROM uso_api WHERE criado_em >= NOW() - ($1 || ' days')::interval`,
      [dias]
    );
    var topUsuarios = await pool.query(
      `SELECT user_id, COUNT(*) as qtd, ROUND(SUM(custo_usd_est)::numeric, 4) as custo_usd
       FROM uso_api WHERE criado_em >= NOW() - ($1 || ' days')::interval
       GROUP BY user_id ORDER BY custo_usd DESC LIMIT 15`,
      [dias]
    );
    var totalUsd = parseFloat(totalGeral.rows[0].custo_total_usd) || 0;
    res.json({
      periodo_dias: dias,
      total_analises: parseInt(totalGeral.rows[0].total_analises),
      custo_total_usd: totalUsd,
      custo_total_brl_estimado: Math.round(totalUsd * 5.30 * 100) / 100,
      por_tipo: porTipo.rows,
      top_15_usuarios_por_custo: topUsuarios.rows
    });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── WEBHOOK MERCADO PAGO ──────────────────────────────────────
app.post("/webhook-pagamento", async function(req, res) {
  console.log("Webhook MP:", JSON.stringify(req.body).substr(0,200));
  var data = req.body;

  // Eventos de assinatura recorrente (preapproval): cobrança recusada, cancelamento
  // feito pelo próprio cliente direto no app do Mercado Pago, etc.
  if (data.type === "subscription_preapproval" && data.data && data.data.id) {
    try {
      var rs = await fetch("https://api.mercadopago.com/preapproval/"+data.data.id, { headers:{ "Authorization":"Bearer "+MP_TOKEN } });
      var assinatura = await rs.json();
      if (assinatura.external_reference) {
        var userId = assinatura.external_reference;
        if (assinatura.status === "cancelled" || assinatura.status === "paused") {
          await dbAtualizarAssinatura(userId, "gratuito", "", assinatura.id, assinatura.status);
          console.log("⚠️ Assinatura", assinatura.status, "para", userId);
        } else if (pool) {
          await pool.query("UPDATE usuarios SET assinatura_status=$2 WHERE user_id=$1", [userId, assinatura.status]);
        }
      }
    } catch(e) { console.error("Webhook preapproval erro:", e.message); }
    return res.json({ ok:true });
  }

  if (data.type === "payment" && data.data && data.data.id) {
    try {
      var r = await fetch("https://api.mercadopago.com/v1/payments/"+data.data.id, {
        headers: { "Authorization":"Bearer "+MP_TOKEN }
      });
      var pagamento = await r.json();
      if (pagamento.status === "approved" && pagamento.metadata) {
        var userId  = pagamento.metadata.user_id;
        var planoId = pagamento.metadata.plano_id;
        var tipo    = planoId && planoId.indexOf("premium")>-1?"premium":planoId && planoId.indexOf("pro")>-1?"pro":"basico";
        if (userId) {
          await dbAtualizarPlano(userId, tipo, planoId);
          if (pool) {
            await pool.query(
              "INSERT INTO pagamentos (id,user_id,plano_id,status,valor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
              [String(pagamento.id), userId, planoId, "approved", pagamento.transaction_amount||0]
            );
          }
          console.log("✅ Plano", tipo, "ativado para", userId);
        }
      }
    } catch(e) { console.error("Webhook erro:", e.message); }
  }
  res.json({ ok:true });
});

// ── GERAR PIX ─────────────────────────────────────────────────
app.post("/gerar-pix", async function(req, res) {
  var planoId = req.body.plano, userId = req.body.userId;
  var email   = req.body.email||"produtor@doutorcafe.app";
  var plano   = PLANOS[planoId];
  var nome    = req.body.nome||"Produtor Rural";
  var cpf     = req.body.cpf||"00000000000";
  if (!plano) return res.status(400).json({ erro:"Plano inválido" });
  var body = {
    transaction_amount: plano.valor, description: plano.nome, payment_method_id:"pix",
    payer:{ email, first_name:nome.split(' ')[0], last_name:nome.split(' ').slice(1).join(' ')||"Rural", identification:{ type:"CPF", number:cpf } },
    metadata:{ plano_id:planoId, user_id:userId, analises:plano.analises },
    notification_url: BASE_URL+"/webhook-pagamento"
  };
  try {
    var r = await fetch("https://api.mercadopago.com/v1/payments", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+MP_TOKEN, "X-Idempotency-Key":userId+"_"+planoId+"_"+Date.now() },
      body:JSON.stringify(body)
    });
    var d = await r.json();
    if (d.id && d.point_of_interaction) {
      if (pool) {
        try {
          await pool.query("INSERT INTO pagamentos (id,user_id,plano_id,status,valor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
            [String(d.id), userId, planoId, "pending", plano.valor]);
        } catch(e) {}
      }
      res.json({ id:d.id, qr_code:d.point_of_interaction.transaction_data.qr_code, qr_code_base64:d.point_of_interaction.transaction_data.qr_code_base64, valor:plano.valor, plano:plano.nome });
    } else {
      res.status(500).json({ erro:"Erro ao gerar PIX", detalhe:d.message||d.error });
    }
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── CRIAR ASSINATURA (Card Payment Brick — sem sair do app) ────
// O frontend renderiza o Card Payment Brick, tokeniza o cartão, e manda
// o card_token_id pra cá. A gente cria a assinatura recorrente direto na
// API do Mercado Pago (/preapproval), sem nenhum redirect pro domínio deles.
app.post("/criar-assinatura", async function(req, res) {
  var planoId = req.body.plano, email = req.body.email, userId = req.body.userId, cardTokenId = req.body.card_token_id;
  var plano = PLANOS[planoId];

  if (!plano) return res.status(400).json({ erro:"Plano inválido" });
  if (!plano.preapproval_plan_id) return res.status(400).json({ erro:"Este plano ainda não tem preapproval_plan_id configurado (rode criar-plano-assinatura.js e defina a variável de ambiente)." });
  if (!email || !userId || !cardTokenId) return res.status(400).json({ erro:"Campos obrigatórios: email, userId, card_token_id" });

  var body = {
    preapproval_plan_id: plano.preapproval_plan_id,
    reason: plano.nome,
    external_reference: userId,
    payer_email: email,
    card_token_id: cardTokenId,
    status: "authorized"
  };

  try {
    var r = await fetch("https://api.mercadopago.com/preapproval", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+MP_TOKEN, "X-Idempotency-Key":userId+"_"+planoId+"_"+Date.now() },
      body:JSON.stringify(body)
    });
    var d = await r.json();

    if (!r.ok) {
      console.error("Erro Mercado Pago /preapproval:", JSON.stringify(d));
      return res.status(r.status).json({ erro: d.message||"Não foi possível criar a assinatura.", detalhe:d });
    }

    if (d.status === "authorized") {
      var tipo = planoId.indexOf("premium")>-1?"premium":planoId.indexOf("pro")>-1?"pro":"basico";
      await dbAtualizarAssinatura(userId, tipo, planoId, d.id, d.status);
      if (pool) {
        try {
          await pool.query("INSERT INTO pagamentos (id,user_id,plano_id,status,valor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
            [String(d.id), userId, planoId, "approved", plano.valor]);
        } catch(e) {}
      }
    }

    res.json({ sucesso: d.status === "authorized", status:d.status, preapproval_id:d.id, next_payment_date:d.next_payment_date });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// Consulta o status atual de uma assinatura (tela "minha assinatura")
app.get("/assinatura-status/:userId", async function(req, res) {
  try {
    var u = await dbGetUser(req.params.userId);
    if (!u || !u.mp_preapproval_id) return res.json({ status:"sem_assinatura" });
    var r = await fetch("https://api.mercadopago.com/preapproval/"+u.mp_preapproval_id, { headers:{ "Authorization":"Bearer "+MP_TOKEN } });
    var d = await r.json();
    if (!r.ok) return res.status(r.status).json({ erro:d.message||"Assinatura não encontrada." });
    res.json({ status:d.status, next_payment_date:d.next_payment_date, reason:d.reason, plano:u.plano });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// Cancela a assinatura recorrente (o cliente pode cancelar quando quiser)
app.post("/cancelar-assinatura/:userId", async function(req, res) {
  try {
    var u = await dbGetUser(req.params.userId);
    if (!u || !u.mp_preapproval_id) return res.status(400).json({ erro:"Usuário não tem assinatura ativa." });
    var r = await fetch("https://api.mercadopago.com/preapproval/"+u.mp_preapproval_id, {
      method:"PUT",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+MP_TOKEN },
      body:JSON.stringify({ status:"cancelled" })
    });
    var d = await r.json();
    if (!r.ok) return res.status(r.status).json({ erro:d.message||"Não foi possível cancelar." });
    await dbAtualizarAssinatura(req.params.userId, "gratuito", "", u.mp_preapproval_id, "cancelled");
    res.json({ sucesso:true, status:d.status });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

app.get("/verificar-pix/:paymentId", async function(req, res) {
  try {
    var r = await fetch("https://api.mercadopago.com/v1/payments/"+req.params.paymentId, { headers:{ "Authorization":"Bearer "+MP_TOKEN } });
    var p = await r.json();
    if (p.status === "approved" && p.metadata && p.metadata.user_id) {
      var tipo = p.metadata.plano_id && p.metadata.plano_id.indexOf("premium")>-1?"premium":p.metadata.plano_id && p.metadata.plano_id.indexOf("pro")>-1?"pro":"basico";
      await dbAtualizarPlano(p.metadata.user_id, tipo, p.metadata.plano_id);
    }
    res.json({ status:p.status, aprovado:p.status==="approved", plano_id:p.metadata&&p.metadata.plano_id, user_id:p.metadata&&p.metadata.user_id });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

app.get("/plano/:userId", async function(req, res) {
  try {
    var u = await dbGetUser(req.params.userId);
    if (!u) return res.json({ plano:"gratuito", analisesUsadas:0, analisesRestantes:15, limite:15, videosUsados:0, videosRestantes:2, limiteVideo:2 });
    var restantes = analisesRestantes(u);
    res.json({
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0,
      analisesRestantes: restantes,
      limite: LIMITES[u.plano||"gratuito"]||15,
      videosUsados: u.videos_usados||u.videosUsados||0,
      videosRestantes: videosRestantes(u),
      limiteVideo: VIDEO_LIMITES[u.plano||"gratuito"]||2
    });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── DIAGNÓSTICO SSE ─── Sonnet 4-6 | max_tokens:3000 | stream:true ──
app.post("/diagnostico", async function(req, res) {
  var imagem  = req.body.imagem;
  var tipo    = req.body.tipo||"image/jpeg";
  var regiao  = req.body.regiao||null;
  var altitude= req.body.altitude||null;
  var userId  = req.body.userId||"anonimo";

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ erro:"Muitas análises em sequência. Aguarde 1 minuto." });
  }
  if (userId !== "anonimo") {
    var u = await dbGetUser(userId);
    if (u && analisesRestantes(u) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }

  var contextoRegional = buildContextoRegional(regiao, altitude, false);

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("X-Accel-Buffering","no");
  res.flushHeaders();

  var ping = setInterval(function(){ try { res.write(": ping\n\n"); } catch(e){ clearInterval(ping); } }, 5000);
  function encerrar() { clearInterval(ping); try { res.end(); } catch(e){} }

  fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key":KEY, "anthropic-version":"2023-06-01" },
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:3000, stream:true,
      system:[
        { type:"text", text: buildPromptStatic(false), cache_control:{ type:"ephemeral" } },
        { type:"text", text: contextoRegional }
      ],
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:tipo, data:imagem }}
      ]}]
    })
  })
  .then(function(r) {
    var Readable = require("stream").Readable;
    var stream = Readable.fromWeb(r.body);
    var buf="", texto="", parciaisEnviados=0, completosEnviados=0, diagsCompletos=[];
    var usageCapturado={input_tokens:0,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0};

    function detectarParciais() {
      var re=/"diagnostico"\s*:\s*"([^"]+)"\s*,\s*"estagio"\s*:\s*(\d+)\s*,\s*"confianca"\s*:\s*"([^"]+)"/g;
      var m, found=[];
      while((m=re.exec(texto))!==null) found.push({ diagnostico:m[1], estagio:parseInt(m[2]), confianca:m[3], visto:"", acao:"Analisando...", fungicidas:[], parcial:true });
      for(var k=parciaisEnviados;k<found.length;k++){
        res.write("data: "+JSON.stringify({ tipo:"diag", diag:found[k] })+"\n\n");
        parciaisEnviados++;
      }
    }

    function extrairCompletos() {
      var ini=texto.indexOf('"diagnosticos":[');
      if(ini===-1) return;
      var pos=ini+16, found=[];
      while(pos<texto.length){
        var s=texto.indexOf("{",pos);
        if(s===-1) break;
        var d=0,i=s;
        while(i<texto.length){
          if(texto[i]==="{") d++;
          else if(texto[i]==="}"){d--;if(d===0){try{var o=JSON.parse(texto.substring(s,i+1));if(o.diagnostico)found.push(o);}catch(e){}pos=i+1;break;}}
          i++;
        }
        if(d>0) break;
      }
      diagsCompletos=found;
      for(var k=completosEnviados;k<found.length;k++){
        res.write("data: "+JSON.stringify({ tipo:"diag_completo", diag:found[k], index:k })+"\n\n");
        completosEnviados++;
      }
    }

    stream.on("data", function(chunk) {
      buf+=chunk.toString();
      var linhas=buf.split("\n"); buf=linhas.pop();
      linhas.forEach(function(linha){
        if(!linha.startsWith("data: ")) return;
        var d=linha.slice(6);
        if(d==="[DONE]") return;
        try {
          var ev=JSON.parse(d);
          if(ev.type==="message_start"&&ev.message&&ev.message.usage){
            var u0=ev.message.usage;
            usageCapturado.input_tokens=u0.input_tokens||0;
            usageCapturado.cache_creation_input_tokens=u0.cache_creation_input_tokens||0;
            usageCapturado.cache_read_input_tokens=u0.cache_read_input_tokens||0;
          }
          if(ev.type==="message_delta"&&ev.usage){
            usageCapturado.output_tokens=ev.usage.output_tokens||usageCapturado.output_tokens;
          }
          if(ev.type==="content_block_delta"&&ev.delta&&ev.delta.text){
            texto+=ev.delta.text;
            detectarParciais();
            extrairCompletos();
          }
        }catch(e){}
      });
    });

    stream.on("end", function() {
      var resultado=extrairJSON(texto);
      if(!resultado||!resultado.diagnosticos||!resultado.diagnosticos.length){
        resultado=diagsCompletos.length?{diagnosticos:diagsCompletos}
          :{diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente foto mais proxima com boa luz.",fungicidas:[]}]};
      }
      res.write("data: "+JSON.stringify({ tipo:"fim", resultado })+"\n\n");
      logUsoAnalise(userId, "foto", "claude-sonnet-4-6", usageCapturado, regiao);
      encerrar();
    });

    stream.on("error", function(e) {
      res.write("data: "+JSON.stringify({ tipo:"erro", msg:e.message })+"\n\n");
      encerrar();
    });
  })
  .catch(function(e) {
    res.write("data: "+JSON.stringify({ tipo:"erro", msg:e.message })+"\n\n");
    encerrar();
  });
});

// ── DIAGNÓSTICO JSON (fallback iOS) ─── Sonnet | max_tokens:3000 ──
app.post("/diagnostico-json", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg";
  var regiao=req.body.regiao||null, altitude=req.body.altitude||null;
  var userId=req.body.userId||"anonimo";
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var u = await dbGetUser(userId);
    if (u && analisesRestantes(u) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }
  var contextoRegional=buildContextoRegional(regiao,altitude,false);
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,
        system:[
          { type:"text", text: buildPromptStatic(false), cache_control:{ type:"ephemeral" } },
          { type:"text", text: contextoRegional }
        ],
        messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:tipo,data:imagem}}
      ]}]})
    });
    var d=await r.json();
    if(d.error) console.error("ERRO ANTHROPIC /diagnostico-json:", JSON.stringify(d.error));
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /diagnostico-json — texto recebido:", txt);
    if(!resultado||!resultado.diagnosticos||resultado.diagnosticos.length===0){
      resultado={diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente uma foto mais clara.",fungicidas:[]}]};
    }
    logUsoAnalise(userId, "foto", "claude-sonnet-4-6", d.usage, regiao);
    res.json(resultado);
  } catch(e) { console.error("ERRO EXCECAO /diagnostico-json:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── PLANO DE AÇÃO ─── Haiku | max_tokens:2000 ──────────────────
var CATEGORIA_DIAGNOSTICO = {
  ferrugem:"doenca fungica", cercosporiose:"doenca fungica", ascochyta:"doenca fungica",
  antracnose:"doenca fungica", phoma:"doenca fungica", mancha_manteigosa:"doenca fungica",
  corynespora:"doenca fungica", koleroga:"doenca fungica",
  aureolada:"doenca BACTERIANA (nao fungica — fungicida sistemico triazol nao tem efeito, usar so cuprico)",
  bicho:"praga (inseticida)", acaro:"praga (acaricida)", cochonilha:"praga (inseticida)", broca:"praga (inseticida)",
  nitrogenio:"deficiencia nutricional", magnesio:"deficiencia nutricional", potassio:"deficiencia nutricional",
  ferro:"deficiencia nutricional", calcio:"deficiencia nutricional", boro:"deficiencia nutricional", zinco:"deficiencia nutricional"
};
app.post("/plano-acao", async function(req, res) {
  var diagnosticos=req.body.diagnosticos||[], regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  if(diagnosticos.length===0) return res.json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"" });

  var regiaoCtx=regiao?" Regiao: "+regiao+".":"";
  var resumoDiags=diagnosticos.map(function(d,i){
    var f=d.fungicidas&&d.fungicidas.length>0
      ?d.fungicidas.map(function(f){
          var dose=(f.dose_min!=null&&f.dose_max!=null&&f.unidade&&f.por)
            ?" DOSE EXATA A USAR: "+f.dose_min+"-"+f.dose_max+f.unidade+"/"+f.por+" (NAO altere esta dose nem a unidade)"
            :"";
          return (f.nome_comercial||f.nome)+" ("+f.tipo+")"+dose;
        }).join("; ")
      :"sem fungicida indicado";
    var cat=CATEGORIA_DIAGNOSTICO[d.diagnostico]||"categoria nao especificada — nao presuma, use so o nome";
    return (i+1)+". "+d.diagnostico+" ["+cat+"] estagio "+d.estagio+" — produtos individuais: "+f;
  }).join("\n");

  var sistemaStatic =
"Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira.\n\n"+
"REGRAS OBRIGATORIAS DE COMPATIBILIDADE — VIOLACAO E ERRO GRAVE:\n"+
"1. PROIBIDO: dois triazois na mesma calda OU em aplicacoes consecutivas sem intervalo adequado.\n"+
"   TRIAZOIS: Tebuconazol=Folicur, Ciproconazol=Priori Xtra/Opera, Difenoconazol=Amistar Top/Score, Epoxiconazol=Opera.\n"+
"   ROTACAO CORRETA apos Amistar Top: Cercobin+Cuprogarb. Apos Folicur: Priori Xtra ou Amistar Top. Apos Priori Xtra: Folicur ou Amistar Top.\n"+
"2. PROIBIDO: duas estrobilurinas juntas.\n"+
"3. PERMITIDO: protetor cuproso com qualquer sistemico.\n"+
"4. PERMITIDO: Cercobin com qualquer produto.\n"+
"5. Intervalo minimo: 14-21 dias.\n\n"+
"DOSE DOS PRODUTOS: quando um produto individual vier com 'DOSE EXATA A USAR', copie exatamente esse valor e unidade (kg ou L, conforme informado) ao mencionar a dose nos campos urgente/em_21_dias. NUNCA troque a unidade (ex: nao converta kg para mL) nem cite uma dose diferente da fornecida — voce nao tem acesso a bula do produto, use apenas o valor dado.\n\n"+
"CATEGORIA DE CADA DIAGNOSTICO: cada item da lista vem com sua categoria entre colchetes (ex: [doenca fungica], [doenca BACTERIANA], [praga], [deficiencia nutricional]). USE ESSA CATEGORIA EXATA no resumo_geral e demais campos — NUNCA infira ou generalize a categoria pelo tipo de produto usado (ex: dois problemas tratados ambos com cuprico NAO significa que sao da mesma categoria biologica).\n\n"+
"REGRA DO CAMPO NUTRICAO — EVITAR INVENCAO:\n"+
"So recomende correcao de um nutriente especifico (nome do nutriente + dose) se: (a) esse nutriente aparece explicitamente na lista de diagnosticos recebida, OU (b) ha uma relacao causal direta e conhecida com uma doenca listada e voce EXPLICITA essa relacao (ex: 'Mg baixo favorece antracnose'). Se nenhum diagnostico de deficiencia foi recebido e nao ha relacao causal clara e citada, NAO mencione nenhum nutriente pelo nome (nem 'de forma especulativa', nem como 'sugestao geral') — apenas escreva 'Nenhuma deficiencia nutricional diagnosticada. Recomenda-se analise foliar/solo periodica.' ou deixe o campo vazio.\n\n"+
"SEJA DIRETO E CONCISO: cada campo deve ter no maximo 3-4 frases curtas ou bullets objetivos. Evite explicacoes longas, repeticao de justificativas, ou sub-listas extensas. Priorize as informacoes mais acionaveis.\n\n"+
"LINGUAGEM PARA PRODUTOR LEIGO — MUITO IMPORTANTE:\n"+
"1. Use APENAS o nome generico com a formulacao exata (ex: 'Oxicloreto de Cobre 840WP', 'Tebuconazol 200SC') EXATAMENTE como aparece na lista de produtos individuais fornecida. NUNCA invente, cite ou 'lembre' nomes comerciais/marcas de memoria — associar a marca errada ao ingrediente errado (ex: chamar Hidroxido de Cobre de 'Recop', que na verdade e Oxicloreto de Cobre) pode levar o produtor a comprar o produto incorreto. NUNCA troque a formulacao (WP/SC/EC) do que foi fornecido.\n"+
"2. Ao citar quantidade de nutriente em forma de oxido (K2O, P2O5, MgO, CaO), adicione uma explicacao curta na PRIMEIRA vez que aparecer no texto, tipo: '(confira essa % no rotulo do adubo que voce comprar)'. Nao repita a explicacao se o mesmo oxido aparecer de novo no mesmo campo.\n"+
"3. Evite jargao sem contexto. Se usar termos como 'calda', 'fertirrigacao', 'pos-emergencia', 'carencia', adicione uma explicacao de 3-6 palavras entre parenteses na primeira mencao (ex: 'fertirrigacao (adubo dissolvido na agua de irrigacao)').\n"+
"4. Prefira frases curtas e diretas a paragrafos corridos. Numere passos quando houver sequencia de acoes.\n\n"+
"FORMATO JSON:\n"+
"{\"resumo_geral\":\"...\",\"urgente\":\"...\",\"em_21_dias\":\"...\",\"nutricao\":\"...\",\"resumo\":\"frase curta\"}";

  var promptUsuario = regiaoCtx+"\n\nDiagnostico encontrou:\n"+resumoDiags;

  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2000,
        system:[ { type:"text", text: sistemaStatic, cache_control:{ type:"ephemeral" } } ],
        messages:[{role:"user",content:[{type:"text",text:promptUsuario}]}]})
    });
    var d=await r.json();
    if(d.error){
      console.error("ERRO ANTHROPIC /plano-acao:", JSON.stringify(d.error));
      return res.status(502).json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"", erro:"Servico de IA indisponivel no momento. Tente novamente em instantes." });
    }
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(!resultado){
      console.error("ERRO PARSE /plano-acao — texto recebido:", txt);
    }
    logUsoAnalise(userId, "plano-acao", "claude-haiku-4-5-20251001", d.usage, regiao);
    res.json(resultado||{ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"", erro:"Nao foi possivel gerar o plano. Tente novamente." });
  } catch(e) {
    console.error("ERRO EXCECAO /plano-acao:", e.message);
    res.status(500).json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"", erro:"Erro de conexao. Tente novamente." });
  }
});

// ── DIAGNÓSTICO VÍDEO ─── Sonnet | max_tokens:3000 ───────────
app.post("/diagnostico-video", async function(req, res) {
  var frames=req.body.frames, regiao=req.body.regiao||null, altitude=req.body.altitude||null;
  var userId=req.body.userId||"anonimo";
  if(!frames||frames.length===0) return res.status(400).json({ erro:"Nenhum frame recebido." });
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var u = await dbGetUser(userId);
    if (u && analisesRestantes(u) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
    if (u && videosRestantes(u) <= 0) {
      return res.status(403).json({ erro:"Limite de videos do plano atingido neste mes. Use foto ou aguarde o proximo ciclo.", semVideos:true });
    }
  }
  var contextoRegional=buildContextoRegional(regiao,altitude,true);
  var content=[];
  frames.forEach(function(frame,i){ content.push({type:"text",text:"Frame "+(i+1)+":"}); content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:frame}}); });
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,
        system:[
          { type:"text", text: buildPromptStatic(true), cache_control:{ type:"ephemeral" } },
          { type:"text", text: contextoRegional }
        ],
        messages:[{role:"user",content}]})
    });
    var d=await r.json();
    if(d.error) console.error("ERRO ANTHROPIC /diagnostico-video:", JSON.stringify(d.error));
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /diagnostico-video — texto recebido:", txt);
    logUsoAnalise(userId, "video", "claude-sonnet-4-6", d.usage, regiao);
    res.json(resultado||{diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente novamente.",fungicidas:[]}]});
  } catch(e) { console.error("ERRO EXCECAO /diagnostico-video:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── ANÁLISE DE SOLO ─── Sonnet | max_tokens:1200 ─────────────
app.post("/analise-solo", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa.\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,
        system:[
          { type:"text", text: sistemaStatic, cache_control:{ type:"ephemeral" } },
          { type:"text", text: contexto||"Sem contexto regional adicional." }
        ],
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:tipo,data:imagem}}]}]})
    });
    var d=await r.json();
    if(d.error) console.error("ERRO ANTHROPIC /analise-solo:", JSON.stringify(d.error));
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /analise-solo — texto recebido:", txt);
    logUsoAnalise(userId, "solo", "claude-sonnet-4-6", d.usage, regiao);
    res.json(resultado||{acao:"Nao foi possivel ler o laudo. Verifique a foto e tente novamente.",valores:{}});
  } catch(e) { console.error("ERRO EXCECAO /analise-solo:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── IDENTIFICA DANINHA ─── Haiku | max_tokens:800 ────────────
// ATUALIZADO: todas as 12 plantas agora possuem descritores visuais completos
// (habito de crescimento, caule, folha, flor/fruto, traco distintivo) para
// reduzir confusao entre especies parecidas — ex: caruru sendo confundido
// com corda-de-viola por falta de descricao visual.
app.post("/identifica-daninha", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro.\n\n"+
"REGRA MAIS IMPORTANTE: Identifique TODAS as especies de plantas daninhas visiveis na imagem.\n\n"+
"PLANTAS DANINHAS DO CAFE:\n"+
"1. PICAO-PRETO (Bidens pilosa): ERETA ramificada 30cm-1,2m, folhas OPOSTAS compostas serrilhadas em 3 segmentos, flores pequenas AMARELAS com petalas brancas ao redor, frutos com sementes ESPINHOSAS pretas alongadas que grudam em roupa/pelo. Solo fertil e adubado. Goal BR 5-6L/ha PRE-emergencia ou POS-emergencia.\n"+
"2. CAPIM-AMARGOSO (Digitaria insularis): GRAMINEA perene em TOUCEIRAS 50cm-1,5m, folhas LONGAS estreitas com pelos BRANCOS nas bordas e nervura central esbranquicada, inflorescencia em PANICULA prateada/roxa no topo. Solo degradado ou compactado, comum em areas com resistencia a glifosato. ACCase: Fusilade, Verdict Max 0,2-0,4L/ha.\n"+
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): GRAMINEA anual touceiras RASAS e achatadas em formato de LEQUE, folhas planas dobradas na base, espiga terminal com 2-7 racemos digitados lembrando \"pe de galinha\". Solo COMPACTADO por trafego de maquinas. ACCase + glifosato.\n"+
"4. BUVA/VOADEIRA (Conyza spp.): ERETA ate 2m, caule unico piloso, folhas ESTREITAS lanceoladas alternadas formando aspecto de \"espeto\" cilindrico, flores pequenas esbranquicadas no topo, sementes com PAPPUS algodonoso que voam com o vento. NAO e graminea. Solo de plantio direto, comum em areas com resistencia a glifosato. Galigan 240EC 3L/ha, Heat 700WG 70-100g/ha.\n"+
"5. CARURU (Amaranthus spp.): ERETA (NAO trepadeira) 20cm-2m, caule ROXO ou AVERMELHADO grosso e estriado, folhas OVALADAS pecioladas alternadas com nervuras bem marcadas, inflorescencia TERMINAL em ESPIGA densa avermelhada ou esverdeada. Solo fertil rico em nitrogenio. Heat 700WG 70-100g/ha POS-emergencia, ou Aurora 400EC 1-1,5L/ha.\n"+
"6. TIRIRICA (Cyperus rotundus): ERETA 15-40cm, folhas em TRES FILEIRAS (caule TRIANGULAR ao corte), brilhantes e estreitas saindo da base, inflorescencia em umbela com espiguetas avermelhadas, raizes com TUBERCULOS (rizomas) que se espalham no solo. Solo com DRENAGEM RUIM ou encharcado. Glifosato + Diuron, dificil controle por causa dos tuberculos.\n"+
"7. CORDA-DE-VIOLA (Ipomoea spp.): TREPADEIRA vigorosa, folhas CORDADAS em forma de coracao grandes 5-15cm, flores roxas ou brancas em forma de trombeta, caule volvel enrolando em TUDO ao redor. Cobre completamente o cafeeiro sufocando-o. Solo FERTIL disturbado. Aurora 400EC 1-1,5L/ha POS-emergencia precoce. Ally 600WG 4-6g/ha. Controle URGENTE antes de florescer para evitar banco de sementes.\n"+
"8. CAPIM-GORDURA (Melinis minutiflora): GRAMINEA perene PELUDA e VISCOSA ao toque, cor AMARELO-ESVERDEADA, folhas macias com pelos longos, cheiro caracteristico de MEL ao amassar, inflorescencia rosada aberta. Solo pobre e acido, pastagem degradada. ACCase: Select 240EC 0,45L/ha.\n"+
"9. CAPIM-BRAQUIARIA (Urochloa spp.): GRAMINEA perene estolonifera/touceira robusta 40cm-1m, folhas LARGAS pilosas na base, bainha com pelos, inflorescencia em RACEMOS alongados unilaterais tipo \"dedos\". Geralmente presente nas ENTRELINHAS (pastagem/cobertura), torna-se problema quando invade a LINHA do cafeeiro. ACCase seletivo na linha.\n"+
"10. TRAPOERABA (Commelina benghalensis): RASTEIRA suculenta enraizando nos nos, folhas OVALADAS lanceoladas com bainha que envolve o caule (tipica de Commelinaceae), flores pequenas AZUIS com 3 petalas (2 grandes + 1 pequena). Solo UMIDO e sombreado, comum em areas irrigadas. 2,4-D, dificil controle por reenraizamento dos fragmentos.\n"+
"11. GUANXUMA (Sida spp.): ARBUSTIVA ereta 50cm-1,5m, caule fibroso lenhoso na base, folhas OVALADAS serrilhadas com peciolo longo, flores AMARELAS pequenas com 5 petalas, frutos em capsula segmentada tipo \"queijinho\". Solo DEGRADADO ou de baixa fertilidade. 2,4-D.\n"+
"12. MARIA-PRETINHA (Solanum americanum): ERETA ramificada 30cm-1m, folhas OVALADAS com bordas onduladas, flores BRANCAS pequenas em forma de estrela com anteras amarelas (tipica de Solanaceae), frutos em BAGAS REDONDAS pretas brilhantes quando maduras, TOXICA para consumo. Solo fertil, comum em areas de cultivo. Glifosato, 2,4-D.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"plantas\":[{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo\",\"acao\":\"o que fazer\",\"urgencia\":\"alta|media|baixa\",\"produtos\":[{\"nome\":\"nome comercial\",\"dose\":\"dose pratica\",\"como_usar\":\"instrucao\"}],\"alerta\":\"aviso importante\"}],\"indicador_geral\":\"o que indica sobre o solo\",\"manejo_integrado\":\"estrategia geral\"}";

  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:800,
        system:[
          { type:"text", text: sistemaStatic, cache_control:{ type:"ephemeral" } },
          { type:"text", text: contexto||"Sem contexto regional adicional." }
        ],
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:tipo,data:imagem}}]}]})
    });
    var d=await r.json();
    console.log("STATUS DANINHA:", r.status, "| RESPOSTA:", JSON.stringify(d).substring(0,500));
    if(d.error) console.error("ERRO ANTHROPIC /identifica-daninha:", JSON.stringify(d.error));
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    logUsoAnalise(userId, "daninha", "claude-haiku-4-5-20251001", d.usage, regiao);
    if(resultado){
      if(!resultado.plantas) resultado={ plantas:[resultado], indicador_geral:resultado.indicador||"", manejo_integrado:resultado.manejo_preventivo||"" };
      if(!resultado.plantas||resultado.plantas.length===0) resultado.plantas=[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}];
      res.json(resultado);
    } else {
      console.error("EXTRAIRJSON FALHOU. Texto recebido:", txt.substring(0,500));
      res.json({plantas:[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}],indicador_geral:"",manejo_integrado:""});
    }
  } catch(e) { console.error("ERRO DANINHA CATCH:", e.message, e.stack); res.status(500).json({ erro:e.message }); }
});

// ── EXTRATOR JSON ─────────────────────────────────────────────
function extrairJSON(txt) {
  if(!txt) return null;
  txt=txt.replace(/```json/gi,"").replace(/```/g,"").trim();
  try { var ini=txt.indexOf("{"),fim=txt.lastIndexOf("}"); if(ini>-1&&fim>ini) return JSON.parse(txt.substring(ini,fim+1)); } catch(e1){}
  try { var clean=txt.replace(/[\u0000-\u001F\u007F-\u009F]/g," "); var ini=clean.indexOf("{"),fim=clean.lastIndexOf("}"); if(ini>-1&&fim>ini) return JSON.parse(clean.substring(ini,fim+1)); } catch(e2){}
  return null;
}

// ── BUILD PROMPT ──────────────────────────────────────────────
// Dividido em duas partes para permitir prompt caching:
// - buildPromptStatic: texto fixo (instrucoes, regras, formato JSON) que se repete
//   identico em toda chamada do mesmo tipo (foto ou video). Vai no "system" com
//   cache_control:{type:"ephemeral"} para reaproveitar via cache hit (ate 90% mais barato).
// - buildContextoRegional: texto curto e variavel por regiao/altitude, NAO cacheado,
//   enviado como bloco separado apos o bloco cacheado.
function buildContextoRegional(regiao, altitude, isVideo) {
  var contextoRegional="";
  if(regiao){
    var def={
      "Cerrado Mineiro":"solos acidos com deficiencia frequente de Calcio Magnesio e Boro. Alta incidencia de ferrugem em anos umidos.",
      "Sul de Minas":"altitudes acima de 800m favorecem Phoma e Cercosporiose. Risco de deficiencia de Zinco.",
      "Mogiana":"regiao quente 22-26C com risco de acaro vermelho e broca em periodos secos. Deficiencia de Potassio comum.",
      "Matas de Minas":"alta umidade favorece ferrugem e bicho-mineiro. Deficiencia de Fosforo e Magnesio.",
      "Chapada Diamantina":"altitude elevada favorece Phoma. Deficiencia de Nitrogenio e Boro.",
      "Planalto da Bahia":"clima seco favorece acaro vermelho. Deficiencia de Ferro em solos alcalinos.",
      "Rondonia":"alta umidade favorece ferrugem antracnose e cercosporiose. Solos acidos.",
      "Norte do Parana":"risco de geadas maio-agosto. Risco de deficiencia de Manganes.",
      "Espirito Santo":"alta umidade favorece cercosporiose e cochonilha.",
      "Alta Paulista":"clima quente e seco favorece acaro vermelho. Deficiencia de Zinco."
    };
    var info=def[regiao]||"regiao cafeeira brasileira.";
    contextoRegional="CONTEXTO REGIONAL: Produtor na regiao "+regiao+". "+info;
    if(altitude){ contextoRegional+=" Altitude: "+altitude+"m."; if(altitude>900) contextoRegional+=" Altitude alta: maior risco de Phoma e Cercosporiose."; if(altitude<600) contextoRegional+=" Altitude baixa: maior risco de ferrugem acaro vermelho e broca."; }
  } else {
    contextoRegional="Sem contexto regional adicional.";
  }
  if(isVideo) contextoRegional+="\n\nVoce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto.";
  return contextoRegional;
}

function buildPromptStatic(isVideo) {
  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia.\n\n"+
"REGRA MAIS IMPORTANTE: Voce DEVE listar TODOS os problemas visiveis na imagem. Nunca omita um diagnostico por ja ter encontrado outro. NUNCA diagnostique saudavel se houver qualquer mancha, lesao, descoloracao ou sintoma visivel na folha.\n\n"+
"PRIORIDADE MAXIMA — FERRUGEM (Hemileia vastatrix): manchas AMARELO-ALARANJADAS face INFERIOR, po alaranjado. Se encontrar QUALQUER sinal alaranjado: DIAGNOSTIQUE como ferrugem.\n\n"+
"DOENCAS FUNGICAS:\nferrugem=pustulas ALARANJADAS face INFERIOR.\ncercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\nascochyta=manchas GRANDES marrom-escuras HALOS CONCENTRICOS halo amarelo extenso, favorecida por clima ameno 15-25C.\nantracnose=lesoes AFUNDADAS pretas bordas irregulares.\nphoma=manchas NECROTICAS negras SEM halo FOLHAS NOVAS.\naureolada=bacteriana manchas pardas HALO AMARELO GRANDE.\nmancha_manteigosa=manchas ENCHARCADAS OLEOSAS.\ncorynespora=manchas IRREGULARES marrom-avermelhadas halo amarelo MAIORES que cercosporiose.\nkoleroga=FOLHAS CAIDAS presas por FIOS DE MICELIO.\n\n"+
"PRAGAS:\nbicho=TRILHAS SERPENTINAS castanhas dentro da folha.\nacaro=folha BRONZEADA acinzentada opaca.\ncochonilha=massas BRANCAS algodonosas em ramos.\nbroca=FURO CIRCULAR 1-2mm no FRUTO.\n\n"+
"DEFICIENCIAS:\nnitrogenio=folha TODA AMARELA UNIFORME folhas velhas.\nmagnesio=nervuras VERDES tecido AMARELO internerval.\npotassio=QUEIMA bordas e pontas folhas velhas.\nferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\ncalcio=folhas NOVAS deformadas ENCURVADAS.\nboro=folhas NOVAS QUEBRADICAS.\nzinco=folhas NOVAS ESTREITAS roseta.\n\n"+
"FRUTOS:\nfruto_verde=verde firme sem lesoes.\nfruto_maduro=VERMELHO ou AMARELO cereja brilhante.\nfruto_passado=ESCURECIDO enrugado seco.\nbroca=FURO CIRCULAR escuro 1-2mm.\nantracnose_fruto=lesoes AFUNDADAS CIRCULARES marrom-escuras.\n\n"+
"PRODUTOS:\nferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.75 unidade_proporcao:mL intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\ncercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\nascochyta: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\nantracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\nphoma: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14. Mancozebe 800WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\naureolada: ATENCAO doenca BACTERIANA nao fungica — fungicida sistemico triazol NAO tem efeito, usar SOMENTE cupricos com acao bactericida. Oxicloreto Cobre 840WP protetor 4-4,5kg/ha proporcao_por_litro:4 unidade_proporcao:g intervalo:15 obs:acao_bactericida. Hidroxido Cobre 770WG protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:15 obs:acao_bactericida.\nmancha_manteigosa: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\ncorynespora: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\nkoleroga: Oxicloreto Cobre 840WP protetor 2,5-3kg/ha proporcao_por_litro:3 unidade_proporcao:g intervalo:14 obs:associar_desbaste_ramos_internos_e_poda_para_ventilacao.\nbicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha proporcao_por_litro:0.1 unidade_proporcao:g intervalo:30.\nacaro: Abamectina 18EC acaricida 0,5-0,75L/ha proporcao_por_litro:0.5 unidade_proporcao:mL intervalo:21.\ncochonilha: Imidacloprido 700WG inseticida 0,3-0,5kg/ha proporcao_por_litro:0.4 unidade_proporcao:g intervalo:30.\nbroca: Clorpirifos 480EC inseticida 1,5-2L/ha proporcao_por_litro:1.75 unidade_proporcao:mL intervalo:30.\n\n"+
"INSTRUCOES FINAIS: Liste TODOS os problemas. Ordene do mais grave. Deficiencias nutricionais: fungicidas:[]. NUNCA retorne saudavel se houver sintoma.\n"+
"No campo 'acao', use linguagem simples para produtor leigo: use APENAS o nome generico do produto com a formulacao exata da lista PRODUTOS (ex: 'Oxicloreto de Cobre 840WP'), NUNCA invente ou cite nome comercial/marca de memoria — associar a marca errada ao ingrediente errado pode levar o produtor a comprar o produto incorreto. Explique rapidamente (3-6 palavras) qualquer termo tecnico como K2O/P2O5, calda, fertirrigacao, carencia, pos-emergencia.\n"+
"IMPORTANTE no campo 'nome' de cada fungicida: SEMPRE inclua o codigo de formulacao (WP, WG, SC, EC etc) exatamente como aparece na lista PRODUTOS acima — ex: 'Oxicloreto de Cobre 840WP', NUNCA apenas 'Oxicloreto de Cobre'. O app usa esse codigo para orientar a ordem de mistura no tanque; omiti-lo quebra essa funcionalidade.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"o que fazer\",\"fungicidas\":[{\"nome\":\"generico com formulacao, ex: Oxicloreto de Cobre 840WP\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
initDB().then(function() {
  app.listen(process.env.PORT||8080, function() {
    console.log("🌿 Doutor Cafe API ok — porta", process.env.PORT||8080);
    console.log("   DB:", pool?"PostgreSQL":"memória");
  });
});
