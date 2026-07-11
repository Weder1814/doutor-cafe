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
var ADMIN_SENHA = process.env.ADMIN_SENHA; // NUNCA hardcode: defina no Railway
if (!ADMIN_SENHA) console.warn("⚠️ ADMIN_SENHA não definida — endpoints /usuarios e /custo-api ficarão bloqueados por segurança.");

// Autorização dos endpoints administrativos. Sem ADMIN_SENHA configurada,
// bloqueia por padrão (fail-closed) em vez de aceitar uma senha fixa conhecida.
function adminAutorizado(req) {
  return !!ADMIN_SENHA && req.query.senha === ADMIN_SENHA;
}

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
  premium:  400,
  admin:    999999
};

// ── LIMITE SEPARADO PARA VIDEO (custa ~2x uma foto: 4 frames analisados) ──
var VIDEO_LIMITES = {
  gratuito: 2,
  basico:   10,
  pro:      25,
  premium:  50,
  admin:    999999
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cache_preco_cafe (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        dados       JSONB,
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);
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

// ── RATE LIMITING DE LOGIN (anti força-bruta de PIN) ───────────
// PIN de 4 digitos so tem 10.000 combinacoes. Sem limite, e varrivel em minutos.
// Limita tentativas por IP: 10 por 15 minutos.
var loginRateMap = {};
var LOGIN_MAX = 10;
var LOGIN_JANELA = 15 * 60 * 1000;
function ipDaReq(req) {
  var xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "desconhecido";
}
function checkLoginRate(req) {
  var ip = ipDaReq(req);
  var agora = Date.now();
  if (!loginRateMap[ip] || agora > loginRateMap[ip].resetAt) {
    loginRateMap[ip] = { count: 1, resetAt: agora + LOGIN_JANELA };
    return true;
  }
  loginRateMap[ip].count++;
  return loginRateMap[ip].count <= LOGIN_MAX;
}
setInterval(function() {
  var agora = Date.now();
  Object.keys(loginRateMap).forEach(function(k){ if (agora > loginRateMap[k].resetAt) delete loginRateMap[k]; });
}, 5 * 60 * 1000);

// ── PLANOS ────────────────────────────────────────────────────
var PLANOS = {
  basico_mensal:  { nome:"Básico Mensal",  valor:29.90,  analises:130 },
  basico_anual:   { nome:"Básico Anual",   valor:299.90, analises:130 },
  pro_mensal:     { nome:"Pro Mensal",     valor:39.90,  analises:250 },
  pro_anual:      { nome:"Pro Anual",      valor:399.90, analises:250 },
  premium_mensal: { nome:"Premium Mensal", valor:49.90,  analises:400 },
  premium_anual:  { nome:"Premium Anual",  valor:499.90, analises:400 }
};

// ── ENDPOINTS BÁSICOS ─────────────────────────────────────────
app.get("/", function(req, res) { res.json({ status:"online", app:"Doutor Cafe API", db: pool?"postgres":"memoria" }); });
app.get("/ping", function(req, res) { res.json({ ok:true, ts:Date.now() }); });

// ── PREÇO DO CAFÉ (Coffee C via Alpha Vantage — API oficial) ───
// Requer variavel de ambiente ALPHAVANTAGE_API_KEY no Railway (gratis em
// alphavantage.co). Cache de 4h para respeitar limite de 25 chamadas/dia
// do plano gratuito (2 chamadas por atualizacao: cafe + cambio).
var ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_API_KEY;
var _cachePrecoCafe = { data: null, timestamp: 0 }; // fallback em memoria (secundario)
var CACHE_PRECO_MS = 12 * 60 * 60 * 1000; // 12 horas (1 chamada AlphaVantage/atualizacao => max ~2/dia)

// Le o cache do preco no PostgreSQL. Sobrevive a reinicios/deploys, entao a
// Alpha Vantage e chamada no maximo poucas vezes por dia (nunca estoura as 25).
async function lerCachePrecoDB() {
  if (!pool) return null;
  try {
    var r = await pool.query("SELECT dados, atualizado_em FROM cache_preco_cafe WHERE id=1");
    if (r.rows.length === 0) return null;
    return { data: r.rows[0].dados, timestamp: new Date(r.rows[0].atualizado_em).getTime() };
  } catch(e) { console.error("lerCachePrecoDB:", e.message); return null; }
}
async function salvarCachePrecoDB(dados) {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO cache_preco_cafe (id, dados, atualizado_em) VALUES (1, $1, NOW()) " +
      "ON CONFLICT (id) DO UPDATE SET dados=EXCLUDED.dados, atualizado_em=NOW()",
      [JSON.stringify(dados)]
    );
  } catch(e) { console.error("salvarCachePrecoDB:", e.message); }
}

// Busca o dolar de fonte gratuita e SEM limite (AwesomeAPI, brasileira).
// Retorna o valor numerico ou null se falhar — nunca lanca erro, para nao
// derrubar o preco do cafe so porque o cambio ficou indisponivel.
async function buscarDolar() {
  try {
    var r = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL");
    var d = await r.json();
    var bid = d && d.USDBRL && parseFloat(d.USDBRL.bid);
    return (bid && !isNaN(bid)) ? bid : null;
  } catch(e) { console.error("buscarDolar:", e.message); return null; }
}

app.get("/preco-cafe", async function(req, res) {
  var agora = Date.now();
  // 1) cache do banco (fonte de verdade, sobrevive a restart)
  var cacheDB = await lerCachePrecoDB();
  if (cacheDB && cacheDB.data && (agora - cacheDB.timestamp) < CACHE_PRECO_MS) {
    _cachePrecoCafe = cacheDB;
    return res.json(cacheDB.data);
  }
  // 2) cache em memoria (caso o banco esteja fora)
  if (_cachePrecoCafe.data && (agora - _cachePrecoCafe.timestamp) < CACHE_PRECO_MS) {
    return res.json(_cachePrecoCafe.data);
  }
  if (!ALPHAVANTAGE_KEY) {
    console.error("ERRO /preco-cafe: ALPHAVANTAGE_API_KEY nao configurada no Railway");
    if (cacheDB && cacheDB.data) return res.json(Object.assign({}, cacheDB.data, { stale: true }));
    return res.status(503).json({ erro: "indisponivel" });
  }
  try {
    // So o cafe usa a Alpha Vantage (1 chamada). O dolar vem de fonte sem limite.
    var [rCafe, dolar] = await Promise.all([
      fetch("https://www.alphavantage.co/query?function=COFFEE&interval=daily&apikey=" + ALPHAVANTAGE_KEY),
      buscarDolar()
    ]);
    var dCafe = await rCafe.json();

    if (dCafe.Note || dCafe.Information) throw new Error("Alpha Vantage limite/aviso: " + (dCafe.Note || dCafe.Information));

    var serie = dCafe.data;
    if (!serie || serie.length < 2) throw new Error("Serie de cafe vazia ou insuficiente");
    // A API retorna do mais recente para o mais antigo; pula valores nulos/vazios (".")
    var pontosValidos = serie.filter(function(p){ return p.value && p.value !== "."; });
    if (pontosValidos.length < 2) throw new Error("Sem pontos validos suficientes na serie");
    var precoAtual = parseFloat(pontosValidos[0].value);
    var precoAnterior = parseFloat(pontosValidos[1].value);
    if (isNaN(precoAtual) || isNaN(precoAnterior)) throw new Error("Campos de preco invalidos");

    var pontos = precoAtual - precoAnterior;
    var pct = (pontos / precoAnterior) * 100;

    // Cambio e OPCIONAL: se o dolar veio, calcula a saca em reais; se nao, deixa null
    // e o app mostra so o preco internacional + variacao (degradacao elegante).
    var temCambio = (dolar && !isNaN(dolar));
    var precoSacaEstimado = temCambio ? (precoAtual / 100) * 132.277 * dolar : null; // 1 saca=60kg=132.277lb

    var resultado = {
      preco_ny_centavos_lb: Math.round(precoAtual * 100) / 100,
      variacao_pontos: Math.round(pontos * 100) / 100,
      variacao_pct: Math.round(pct * 100) / 100,
      dolar: temCambio ? Math.round(dolar * 100) / 100 : null,
      preco_saca_estimado_reais: temCambio ? Math.round(precoSacaEstimado * 100) / 100 : null,
      cambio_indisponivel: !temCambio,
      data_referencia: pontosValidos[0].date,
      atualizado_em: new Date().toISOString(),
      stale: false
    };
    _cachePrecoCafe = { data: resultado, timestamp: agora };
    await salvarCachePrecoDB(resultado);
    res.json(resultado);
  } catch (e) {
    console.error("ERRO /preco-cafe:", e.message);
    // Em caso de erro/limite, serve o ultimo dado conhecido (banco ou memoria)
    var fallback = (cacheDB && cacheDB.data) ? cacheDB.data : _cachePrecoCafe.data;
    if (fallback) {
      res.json(Object.assign({}, fallback, { stale: true }));
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
  if (!checkLoginRate(req)) return res.status(429).json({ erro:"Muitas tentativas de login. Aguarde 15 minutos." });
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
  if (!checkLoginRate(req)) return res.status(429).json({ erro:"Muitas tentativas de login. Aguarde 15 minutos." });
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
    return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true, analisesRestantes:0 });
  }
  await dbIncrementarAnalise(userId);
  var atualizado = await dbGetUser(userId);
  res.json({
    ok:true,
    plano: (atualizado&&atualizado.plano)||"gratuito",
    analisesUsadas: (atualizado&&(atualizado.analises_usadas||atualizado.analisesUsadas))||0,
    analisesRestantes: atualizado ? analisesRestantes(atualizado) : null,
    limite: LIMITES[(atualizado&&atualizado.plano)||"gratuito"]||15
  });
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
  if (!adminAutorizado(req)) return res.status(401).json({ erro:"Nao autorizado" });
  try {
    if (pool) {
      var r = await pool.query("SELECT user_id,nome,celular,email,regiao,plano,analises_usadas,mes_reset,criado_em FROM usuarios ORDER BY criado_em DESC");
      return res.json({ total:r.rows.length, usuarios:r.rows });
    }
    res.json({ total:Object.keys(usuariosMemoria).length, usuarios:Object.values(usuariosMemoria) });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── ADMIN: DEFINIR PLANO DE UM USUARIO (por CPF) ───────────────
// Libera/ajusta o plano de qualquer conta sem precisar de deploy.
// Ex (plano admin = analises praticamente infinitas):
//   POST /admin/definir-plano  { "senha":"SUA_ADMIN_SENHA", "cpf":"00000000000", "plano":"admin" }
// Planos validos: gratuito, basico, pro, premium, admin
app.post("/admin/definir-plano", async function(req, res) {
  var senha = req.body.senha || req.query.senha;
  if (!ADMIN_SENHA || senha !== ADMIN_SENHA) return res.status(401).json({ erro:"Nao autorizado" });

  var cpf = (req.body.cpf || "").replace(/[^0-9]/g, "");
  var plano = (req.body.plano || "").trim().toLowerCase();
  var PLANOS_VALIDOS = ["gratuito", "basico", "pro", "premium", "admin"];

  if (cpf.length !== 11) return res.status(400).json({ erro:"CPF invalido (11 digitos)." });
  if (PLANOS_VALIDOS.indexOf(plano) === -1) return res.status(400).json({ erro:"Plano invalido.", planos_validos: PLANOS_VALIDOS });

  try {
    var u = await dbGetUserByCPF(cpf);
    if (!u) return res.status(404).json({ erro:"Nenhum usuario com esse CPF." });
    var userId = u.user_id || u.userId;
    await dbAtualizarPlano(userId, plano, plano === "admin" ? "admin_manual" : "");
    res.json({
      ok: true,
      userId: userId,
      nome: u.nome,
      plano_novo: plano,
      limite_analises: LIMITES[plano],
      limite_videos: VIDEO_LIMITES[plano]
    });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── ADMIN: RELATORIO DE CUSTO REAL DA API ──────────────────────
// Mostra custo estimado por tipo de analise, total geral, e ranking de
// usuarios que mais geram custo. Use ?dias=30 para mudar a janela (padrao 30).
app.get("/custo-api", async function(req, res) {
  if (!adminAutorizado(req)) return res.status(401).json({ erro:"Nao autorizado" });
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

app.post("/criar-assinatura", async function(req, res) {
  var planoId = req.body.plano, email = req.body.email||"produtor@doutorcafe.app", userId = req.body.userId, plano = PLANOS[planoId];
  if (!plano) return res.status(400).json({ erro:"Plano inválido" });
  var body = {
    items:[{ title:plano.nome, quantity:1, unit_price:plano.valor, currency_id:"BRL" }], payer:{ email },
    back_urls:{ success:"https://doutor-cafe-app.vercel.app?pagamento=sucesso&plano="+planoId+"&user="+userId, failure:"https://doutor-cafe-app.vercel.app?pagamento=falha", pending:"https://doutor-cafe-app.vercel.app?pagamento=pendente" },
    auto_approve:false, notification_url:BASE_URL+"/webhook-pagamento", metadata:{ plano_id:planoId, user_id:userId, analises:plano.analises }
  };
  try {
    var r = await fetch("https://api.mercadopago.com/checkout/preferences", { method:"POST", headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+MP_TOKEN }, body:JSON.stringify(body) });
    var d = await r.json();
    if (d.id) res.json({ url:d.init_point, id:d.id });
    else res.status(500).json({ erro:"Erro ao criar preferência", detalhe:d.message||d.error });
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
  // Padding inicial: o header X-Accel-Buffering so funciona em proxy NGINX.
  // O proxy da Railway pode ignorar esse header e "represar" a resposta ate
  // fechar a conexao, anulando o streaming. Mandar um comentario SSE grande
  // logo de cara costuma estourar o buffer interno do proxy e forcar ele a
  // comecar a repassar os pedacos de verdade, em vez de acumular tudo.
  res.write(": " + new Array(8193).join(" ") + "\n\n");

  var ping = setInterval(function(){ try { res.write(": ping\n\n"); } catch(e){ clearInterval(ping); } }, 5000);
  function encerrar() { clearInterval(ping); try { res.end(); } catch(e){} }

  fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key":KEY, "anthropic-version":"2023-06-01" },
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:3000, temperature:0, stream:true,
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
      resultado=garantirAvisoFerrugem(resultado);
      resultado=anexarReferenciaVisual(resultado);
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
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,temperature:0,
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
    resultado=garantirAvisoFerrugem(resultado);
    resultado=anexarReferenciaVisual(resultado);
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
  nitrogenio:"deficiencia nutricional", fosforo:"deficiencia nutricional", magnesio:"deficiencia nutricional", potassio:"deficiencia nutricional",
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
"1. PROIBIDO: dois fungicidas do grupo TRIAZOL na mesma calda OU em aplicacoes consecutivas sem intervalo adequado.\n"+
"   TRIAZOIS (mesmo grupo, nao combinar/repetir entre si): Tebuconazol, Ciproconazol, Difenoconazol, Epoxiconazol.\n"+
"   ROTACAO CORRETA: ao reaplicar, troque o MECANISMO DE ACAO (nao repita o mesmo grupo quimico em aplicacoes consecutivas). Ex: apos um triazol, use na proxima aplicacao um protetor cuprico + Tiofanato Metilico.\n"+
"2. PROIBIDO: dois fungicidas do grupo ESTROBILURINA juntos (ex: Azoxistrobina, Piraclostrobina, Trifloxistrobina).\n"+
"3. PERMITIDO: protetor cuproso (cobre) com qualquer sistemico.\n"+
"4. PERMITIDO: Tiofanato Metilico com qualquer outro produto.\n"+
"5. Intervalo minimo: 14-21 dias.\n\n"+
"NUNCA cite nomes comerciais/marcas (proprios ou de memoria) nesta secao ou em qualquer campo de resposta — use somente nomes genericos (ingrediente ativo) e grupo quimico/mecanismo de acao.\n\n"+
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
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2000,temperature:0,
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
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3000,temperature:0,
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
    resultado=garantirAvisoFerrugem(resultado);
    resultado=anexarReferenciaVisual(resultado);
    logUsoAnalise(userId, "video", "claude-sonnet-4-6", d.usage, regiao);
    res.json(resultado||{diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente novamente.",fungicidas:[]}]});
  } catch(e) { console.error("ERRO EXCECAO /diagnostico-video:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── ANÁLISE DE SOLO ─── Sonnet | max_tokens:2000 ─────────────
app.post("/analise-solo", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var uLim = await dbGetUser(userId);
    if (uLim && analisesRestantes(uLim) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa.\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nSe o laudo tiver MAIS DE UMA amostra/talhao, NAO detalhe cada amostra separadamente: consolide tudo em UMA UNICA recomendacao objetiva (use a media ou a amostra mais critica como referencia) e preencha os \"valores\" com a amostra mais representativa ou a media simples entre elas. O campo \"acao\" deve ter no maximo 4 frases curtas, direto ao ponto.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples, maximo 4 frases\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,temperature:0,
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

// ── IDENTIFICA DANINHA ─── SONNET (definitivo — Haiku testado e reprovado: 3/3 erros, alucinação visual) | max_tokens:1600 ────────────
// ATUALIZADO: 18 plantas no catalogo, todas com descritores visuais completos
// (habito de crescimento, caule, folha, flor/fruto, traco distintivo) para
// reduzir confusao entre especies parecidas — ex: caruru sendo confundido
// com corda-de-viola por falta de descricao visual. Cardo-santo/serralha-brava
// (18) adicionada apos aparecer em teste real e nao bater com nenhuma das 17.
app.post("/identifica-daninha", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var uLim = await dbGetUser(userId);
    if (uLim && analisesRestantes(uLim) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro.\n\n"+
"REGRA MAIS IMPORTANTE — HONESTIDADE ACIMA DE TUDO: identifique uma especie APENAS se os tracos visiveis na foto baterem CLARAMENTE com a descricao. E MUITO melhor dizer 'nao identificado com certeza' do que cravar a especie errada — um erro destroi a confianca do produtor. Se a foto estiver distante, desfocada, ou os tracos nao forem nitidos, use confianca 'baixa' e peca uma foto melhor. NUNCA force o encaixe numa das especies abaixo: a planta pode ser outra especie fora da lista.\n\n"+
"PRIMEIRO PASSO OBRIGATORIO — CLASSIFIQUE O GRUPO PELA ORIGEM DAS FOLHAS E CAULE (nao pela largura da folha):\n"+
"A) FOLHA LARGA (eudicotiledonea): folhas saem ALTERNADAS ou OPOSTAS ao longo de um CAULE que cresce para cima; caule REDONDO (cilindrico), com ramos/pecíolo; nervura central com nervuras secundarias em rede. ATENCAO: algumas folhas-largas tem folha ESTREITA/lanceolada (ex: BUVA) — folha estreita NAO faz dela capim nem tiririca.\n"+
"B) CAPIM (graminea/Poaceae): folhas tipo FITA saindo da BASE/touceira, nervuras PARALELAS, sem pecíolo, caule redondo/oco com nós. Ex: capim-amargoso, pe-de-galinha, capim-gordura, braquiaria.\n"+
"C) JUNCA (Cyperaceae — tiririca): folhas saem TODAS DA BASE em TRES FILEIRAS, caule MACICO e TRIANGULAR (3 lados) ao corte, planta baixa (15-40cm). So a tiririca esta aqui.\n"+
"TESTE DECISIVO (use SEMPRE): (1) As folhas saem ao longo de um caule que sobe, alternadas/opostas? => FOLHA LARGA (grupo A), mesmo que as folhas sejam estreitas. (2) As folhas saem todas da base? entao veja o caule: triangular = TIRIRICA (C); redondo com nos = CAPIM (B). (3) A MARGEM da folha tem dentes/recortes visiveis (irregular, nao lisa)? Capim e tiririca SEMPRE tem margem LISA/inteira — margem denteada ou recortada so existe em folha larga. Dentro de folha larga com dentes: se a folha continua UMA PECA SO (dentes so na beirada, sem dividir a folha) = pode ser BUVA; se os recortes vao fundo e DIVIDEM a folha em segmentos separados (quase ate a nervura central) = LOSNA-BRANCA.\n"+
"ATENCAO AO ANGULO DA FOTO (erro comum): uma foto tirada de CIMA PARA BAIXO, direto no topo/broto de uma planta erguida, mostra as folhas se espalhando em RODA ao redor do centro — isso PARECE uma roseta saindo da base (como tiririca), mas NAO E, e sim uma planta de caule unico vista de cima. Antes de concluir 'folhas da base', verifique se da pra ver claramente um UNICO CAULE ERGUIDO abaixo do conjunto de folhas (mesmo que so a base do caule apareca no canto). Se houver duvida sobre o angulo (nao da pra confirmar se as folhas saem de um caule ereto ou realmente da base do solo), use confianca 'baixa' ou 'media' e peca uma FOTO DE LADO mostrando a planta inteira (da base ate o topo) no campo 'acao', em vez de cravar tiririca so pela forma circular do topo.\n"+
"REGRA DE OURO 1: BUVA vs TIRIRICA — a BUVA e alta (ate 2m), folhas ESTREITAS ALTERNADAS subindo por um caule UNICO e redondo, com flores/pappus algodonoso no topo. A TIRIRICA e baixa, folhas saem DA BASE em 3 fileiras, caule TRIANGULAR. Se a planta e alta e tem folhas subindo pelo caule, e BUVA, NUNCA tiririca.\n"+
"REGRA DE OURO 1B: BUVA vs LOSNA-BRANCA E UM CASO DIFICIL — a diferenca de profundidade de recorte na folha pode ser sutil e nao e 100% confiavel sozinha (buva pode ter folha bem serrilhada tambem). O traco REALMENTE decisivo entre essas duas e a INFLORESCENCIA: buva=capitulos pequenos esbranquicados/creme que viram pluma/pappus algodonoso; losna=capitulos brancos pequenos SEMIGLOBOSOS distintos. Se a foto NAO mostra claramente a flor/inflorescencia DA PROPRIA planta em foco, NAO escolha uma das duas como se tivesse certeza — mas TAMBEM NAO retorne generico 'Nao identificado' (essas sao 2 pragas MUITO comuns em lavoura de cafe, e o produtor precisa de uma resposta util). Em vez disso: gere DOIS itens separados no array \"plantas\" (nao combine num nome so) — primeiro item \"nome\":\"Buva\", confianca 'media', 'grupo':'folha_larga'; segundo item \"nome\":\"Losna-branca\", confianca 'baixa' (buva e mais comum em cafezal, por isso vem primeiro). Marque \"hipoteses_mesma_planta\":true no nivel raiz do JSON. Em cada item, no campo 'acao', explique a diferenca visual das flores das duas e recomende fotografar a flor para confirmar; produtos de cada item devem ser so os daquela planta especifica (Galigan/Heat para buva, Ametrina/2,4-D para losna) — nao misture as duas no mesmo item. So use \"Nao identificado com certeza\" quando a planta genuinamente NAO se parecer com NENHUMA especie da lista (nao apenas quando houver duvida entre duas conhecidas).\n"+
"REGRA DE OURO 2: cor da flor e decisiva. Flor AZUL/lilas com 3 petalas + caule suculento = TRAPOERABA. Flor BRANCA em estrela com folhas opostas asperas = POAIA-BRANCA (NAO e trapoeraba).\n\n"+
"REGRA MAIS IMPORTANTE 2: Identifique as especies de plantas daninhas visiveis na imagem que voce reconhece com seguranca.\n\n"+
"PLANTAS DANINHAS DO CAFE:\n"+
"1. PICAO-PRETO (Bidens pilosa): ERETA ramificada 30cm-1,2m, CAULE de secao QUADRANGULAR (4 quinas, nao redondo), folhas OPOSTAS compostas/pinatipartidas serrilhadas em 3 segmentos, flores pequenas AMARELAS com petalas brancas ao redor, frutos com sementes ESPINHOSAS pretas alongadas que grudam em roupa/pelo. Solo fertil e adubado. Goal BR 5-6L/ha PRE-emergencia ou POS-emergencia.\n"+
"2. CAPIM-AMARGOSO (Digitaria insularis): GRAMINEA perene em TOUCEIRAS 50cm-1,5m, folhas LONGAS estreitas com pelos BRANCOS nas bordas e nervura central esbranquicada, inflorescencia em PANICULA prateada/roxa no topo. Solo degradado ou compactado, comum em areas com resistencia a glifosato. ACCase: Fusilade, Verdict Max 0,2-0,4L/ha.\n"+
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): GRAMINEA anual touceiras RASAS e achatadas em formato de LEQUE, folhas planas dobradas na base, espiga terminal com 2-7 racemos digitados lembrando \"pe de galinha\". Solo COMPACTADO por trafego de maquinas. ACCase + glifosato.\n"+
"4. BUVA/VOADEIRA (Conyza bonariensis / C. sumatrensis / C. canadensis): FASE JOVEM (roseta, ANTES de esticar) — folhas em ROSETA BASAL, SEM caule ereto visivel ainda (ou caule bem curto/nao desenvolvido), formato obovado/espatulado (mais larga perto da ponta), margem com dentes IRREGULARES que podem ser profundos a ponto de parecer lobada, mas o LIMBO permanece como peca continua e conectada (nao se separa em segmentos como losna-branca ou cardo-santo). FASE ADULTA (apos esticar) — ERETA 0,5-2m, caule UNICO ROLICO (redondo, NAO triangular), estriado e piloso, pouco ramificado (ramos so proximos ao apice). Folhas NUMEROSAS, estreito-lanceoladas (compridas e finas), alternadas, cobrindo densamente o caule de baixo para cima. MARGEM da folha pode variar de LISA ate BEM DENTEADA/SERRILHADA dependendo da especie — ISSO E NORMAL EM BUVA. O que importa NAO e se tem dentes, e sim ATE ONDE o recorte vai: nos dentes da buva, o LIMBO CONTINUA INTEIRO E CONECTADO no meio da folha (os dentes ficam so na beirada, tipo uma serra, sem separar a folha em pedacos). Panicula terminal com capitulos pequenos esbranquicados/creme que viram PAPPUS algodonoso. CONTRASTE COM LOSNA-BRANCA: em buva, mesmo com dentes fortes, a folha e UMA PECA SO (recorte so na margem); em losna-branca, os recortes vao fundo, quase ate a nervura central, dividindo a folha em segmentos como se fossem varias folhinhas (aspecto de samambaia/salsa). CONTRASTE COM CARDO-SANTO/SERRALHA-BRAVA (item 18) EM FASE DE ROSETA JOVEM (traco mais dificil do catalogo, atencao redobrada): quando so a roseta basal estiver visivel, sem caule ereto desenvolvido, sem espinhos endurecidos nitidos na margem e sem latex leitoso visivel ao partir a folha, PREFIRA BUVA como hipotese principal em vez de cardo-santo — buva e disparadamente mais comum e mais problematica em cafezal brasileiro (resistencia a glifosato generalizada e confirmada), enquanto cardo-santo/serralha e mais tipica de solo exposto/beira de construcao/estrada. So va para cardo-santo/serralha se houver espinhos rigidos bem marcados (Carduus/Cirsium) ou se souber que ha latex ao cortar a folha (Sonchus). Se restar duvida real entre os dois nessa fase de roseta, NAO combine as duas num nome so — gere DOIS itens separados no array \"plantas\": o primeiro (buva) com confianca 'media' e urgencia refletindo a prioridade real, o segundo (cardo-santo/serralha) com confianca 'baixa'; marque \"hipoteses_mesma_planta\":true no nivel raiz do JSON (fora do array) para o app saber que sao duas hipoteses da MESMA planta fotografada, nao duas plantas diferentes encontradas. Em cada um dos dois itens, peca no campo 'acao' a foto do caule alongado ou da flor, ou o teste do latex, para confirmar. Solo de plantio direto, resistencia a glifosato comum. Galigan 240EC 3L/ha, Heat 700WG 70-100g/ha (glifosato sozinho falha).\n"+
"5. LOSNA-BRANCA / MENTRASTO / SANTA-MARIA (Parthenium hysterophorus): FOLHA LARGA. ERETA 50-90cm, herbacea, pilosa, caule sulcado, pouco ramificado embaixo e MUITO ramificado em cima. Folhas ALTERNADAS com limbo recortado tao PROFUNDAMENTE que os segmentos quase se separam, chegando perto da nervura central (aspecto de folha de samambaia, salsa ou cenoura — a folha parece DIVIDIDA em varias partes, nao apenas com bordas denteadas). Capitulos pequenos SEMIGLOBOSOS com flores brancas nas pontas dos ramos (poucas flores liguladas, ao redor de 5). CONTRASTE COM BUVA: losna tem folha DIVIDIDA/segmentada quase ate o centro; buva tem folha INTEIRA como peca unica, mesmo quando a borda tem dentes fortes. Se a folha e uma peca continua so com dentes na beirada, e BUVA; se parece varias folhinhas juntas (segmentada), e LOSNA. Toxica para humanos e animais (cuidado ao manusear), infestante agressiva em cafezais. Ametrina, Glifosato, 2,4-D em pos-emergencia precoce.\n"+
"6. CARURU (Amaranthus spp.): ERETA (NAO trepadeira) 20cm-2m, caule ROXO ou AVERMELHADO grosso e estriado, folhas OVALADAS pecioladas alternadas com nervuras bem marcadas, inflorescencia TERMINAL em ESPIGA densa avermelhada ou esverdeada. Solo fertil rico em nitrogenio. Heat 700WG 70-100g/ha POS-emergencia, ou Aurora 400EC 1-1,5L/ha.\n"+
"7. TIRIRICA (Cyperus rotundus): JUNCA (Cyperaceae). BAIXA 15-40cm (planta INTEIRA baixa, nao so o topo), folhas estreitas BRILHANTES saindo TODAS DA BASE em TRES FILEIRAS, caule MACICO e TRIANGULAR (3 lados) ao corte, inflorescencia em umbela com espiguetas marrom-avermelhadas, raizes com TUBERCULOS/rizomas. CONTRASTE: se a planta e ALTA com folhas ALTERNADAS subindo por um caule, NAO e tiririca (provavelmente buva) — CUIDADO: uma foto de cima no topo de planta alta pode PARECER roseta basal sem ser. So classifique como tiririca se as folhas saem da BASE em 3 fileiras E/OU o caule e triangular, E a planta como um todo e baixa. Solo com DRENAGEM RUIM ou encharcado. Glifosato + Diuron, dificil por causa dos tuberculos.\n"+
"8. CORDA-DE-VIOLA (Ipomoea spp.): TREPADEIRA vigorosa, folhas CORDADAS em forma de coracao grandes 5-15cm, flores roxas ou brancas em forma de trombeta, caule volvel enrolando em TUDO ao redor. Cobre completamente o cafeeiro sufocando-o. Solo FERTIL disturbado. Aurora 400EC 1-1,5L/ha POS-emergencia precoce. Ally 600WG 4-6g/ha. Controle URGENTE antes de florescer para evitar banco de sementes.\n"+
"9. CAPIM-GORDURA (Melinis minutiflora): GRAMINEA perene PELUDA e VISCOSA ao toque, cor AMARELO-ESVERDEADA, folhas macias com pelos longos, cheiro caracteristico de MEL ao amassar, inflorescencia rosada aberta. Solo pobre e acido, pastagem degradada. ACCase: Select 240EC 0,45L/ha.\n"+
"10. CAPIM-BRAQUIARIA (Urochloa spp.): GRAMINEA perene estolonifera/touceira robusta 40cm-1m, folhas LARGAS pilosas na base, bainha com pelos, inflorescencia em RACEMOS alongados unilaterais tipo \"dedos\". Geralmente presente nas ENTRELINHAS (pastagem/cobertura), torna-se problema quando invade a LINHA do cafeeiro. ACCase seletivo na linha.\n"+
"11. TRAPOERABA (Commelina benghalensis): RASTEIRA SUCULENTA enraizando nos nos, folhas OVALADAS com BAINHA membranosa envolvendo o caule (tipico de Commelinaceae), flores AZUIS/lilas com 3 petalas (2 grandes + 1 pequena). CONTRASTE COM POAIA-BRANCA: trapoeraba tem flor AZUL e caule suculento com bainha; poaia tem flor BRANCA e folhas asperas sem bainha. Solo UMIDO e sombreado. 2,4-D, dificil por reenraizamento.\n"+
"12. GUANXUMA (Sida spp.): ARBUSTIVA ereta 50cm-1,5m, caule fibroso lenhoso na base, folhas OVALADAS serrilhadas com peciolo longo, flores AMARELAS pequenas com 5 petalas, frutos em capsula segmentada tipo \"queijinho\". Solo DEGRADADO ou de baixa fertilidade. 2,4-D.\n"+
"13. MARIA-PRETINHA (Solanum americanum): ERETA ramificada 30cm-1m, folhas OVALADAS com bordas onduladas, flores BRANCAS pequenas em forma de estrela com anteras amarelas (tipica de Solanaceae), frutos em BAGAS REDONDAS pretas brilhantes quando maduras, TOXICA para consumo. Solo fertil, comum em areas de cultivo. Glifosato, 2,4-D.\n"+
"14. POAIA-BRANCA / ERVA-QUENTE (Richardia brasiliensis / Spermacoce): RASTEIRA a semi-ereta, folhas OPOSTAS lanceoladas ASPERAS (pilosas) sem bainha, flores BRANCAS pequenas em ESTRELA (4-6 petalas) agrupadas nas pontas dos ramos. CONTRASTE COM TRAPOERABA: aqui a flor e BRANCA e nao ha bainha nem suculencia; trapoeraba tem flor AZUL e bainha. Indica solo compactado/acido. 2,4-D, Glifosato pos-emergencia precoce.\n"+
"15. BELDROEGA (Portulaca oleracea): RASTEIRA SUCULENTA, caule avermelhado grosso e carnudo, folhas pequenas em forma de COLHER (espatuladas) carnudas brilhantes, flores AMARELAS pequenas. Solo fertil e adubado. Glifosato, dificil por rebrota de fragmentos.\n"+
"16. LEITEIRO / AMENDOIM-BRAVO (Euphorbia heterophylla): ERETA 20cm-2m, herbacea, TRACO DECISIVO: solta LATEX BRANCO LEITOSO abundante ao quebrar caule ou folha (teste mais confiavel). HETEROFILIA marcante: folhas de FORMATOS VARIADOS (lanceoladas, ovaladas, obovadas ou elipticas) na MESMA planta, as vezes ate no mesmo ramo — essa variacao de formato e caracteristica da especie. Inflorescencia pouco vistosa (pequenos capitulos verdes). Solo fertil. Glifosato, 2,4-D; resistencia comum a inibidores de ALS.\n"+
"17. GRAMA-SEDA / GRAMA-BERMUDA (Cynodon dactylon): CAPIM perene ESTOLONIFERO rasteiro que forma tapete denso, folhas curtas cinza-esverdeadas, inflorescencia em 3-6 racemos digitados finos. Espalha por estolões e rizomas. Glifosato repetido.\n"+
"18. CARDO-SANTO / SERRALHA-BRAVA (Sonchus oleraceus / Sonchus asper / Carduus/Cirsium spp.): FOLHA LARGA. Roseta basal de folhas GRANDES, LOBADAS e com margem ESPINHOSA/dentada bem marcada, achatada contra o solo no inicio; caule ERETO UNICO emergindo do centro da roseta (as vezes ROXO-AVERMELHADO), folhas superiores ALTERNADAS subindo pelo caule, menores e mais verdes que as basais. Folhas mais velhas/basais podem ter tom ACINZENTADO-ESBRANQUICADO (indumento farinaceo/tricomas densos), formando um contraste visivel com as folhas novas do topo, mais verdes e lisas. TRACO DECISIVO para especie exata: a FLOR — Sonchus (serralha) tem capitulo AMARELO tipo dente-de-leao; Carduus/Cirsium (cardo) tem capitulo ROXO/lilas espinhoso. Se a flor nao estiver visivel na foto, use \"nome\":\"Cardo-santo / Serralha-brava (possivel Sonchus ou Carduus/Cirsium)\", confianca 'media', e peca foto da flor no campo 'acao' para confirmar; inclua produtos para as duas hipoteses (2,4-D ou Glifosato para Sonchus; picloram ou 2,4-D para Carduus/Cirsium). ATENCAO — CONFUSAO COMUM COM BUVA JOVEM (item 4): quando a planta estiver so em fase de roseta (sem caule ereto desenvolvido, sem espinhos rigidos nitidos, sem latex visivel), BUVA jovem e a hipotese MAIS PROVAVEL primeiro, por ser muito mais comum em cafezal — so cravar cardo-santo/serralha-brava com confianca alta se houver espinhos endurecidos claros na margem ou caule roxo-avermelhado grosso bem caracteristico emergindo do centro. Solo compactado, perturbado ou com baixa cobertura vegetal — comum em bordas de construcao, estradas e areas de solo exposto.\n\n"+
"IMPORTANTE no campo 'nome' de cada produto: use o nome generico (ingrediente ativo, ex: Saflufenacil, Carfentrazona-etilica, Glifosato) com a formulacao quando souber. Nomes comerciais citados nas notas acima sao apenas referencia interna — NAO os repita como se fossem o nome do produto, pois o produtor pode ter acesso a uma marca diferente com o mesmo generico.\n\n"+
"REGRA FINAL: Só use confianca 'alta' se o TRACO DECISIVO daquela especie estiver VISIVEL e confirmado na foto (ex: tiririca => folhas da base em 3 fileiras OU caule triangular, margem lisa; buva => folha estreita alternada no caule, formando UMA PECA SO mesmo com dentes na borda + pappus/flores esbranquicadas; losna-branca => folha DIVIDIDA em segmentos que quase chegam a nervura central, tipo samambaia; trapoeraba => flor azul/bainha; poaia => flor branca). Se o traco decisivo NAO aparece, use no maximo 'media'. Se a planta nao corresponde CLARAMENTE a nenhuma especie da lista, use \"nome\":\"Nao identificado com certeza\", confianca 'baixa', e no campo 'acao' peca uma foto mais proxima e nitida da planta inteira (folha, caule e base) — NAO escolha a especie mais parecida so para preencher. Preencha 'grupo' com o grupo que voce viu (folha_larga|capim|junca|indefinido) e 'visto' com os tracos concretos observados.\n"+
"LIMITE DE TAMANHO (mesmo em casos de duas hipoteses, tipo buva-jovem vs cardo-santo, ou buva vs losna-branca): campo 'acao' no MAXIMO 3 frases curtas; campo 'produtos' no MAXIMO 2 itens no total (nao 2 por hipotese); campo 'alerta' no MAXIMO 1 frase. Seja direto — o produtor pode pedir mais detalhes depois se precisar.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"plantas\":[{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"grupo\":\"folha_larga|capim|junca|indefinido\",\"visto\":\"tracos visiveis que justificam a identificacao\",\"confianca\":\"alta|media|baixa\",\"indicador\":\"o que indica sobre o solo\",\"acao\":\"o que fazer\",\"urgencia\":\"alta|media|baixa\",\"produtos\":[{\"nome\":\"nome generico (ingrediente ativo) com formulacao, ex: Saflufenacil 700WG\",\"dose\":\"dose pratica\",\"como_usar\":\"instrucao\"}],\"alerta\":\"aviso importante\"}],\"hipoteses_mesma_planta\":\"true SOMENTE quando o array plantas contiver 2 hipoteses concorrentes para UMA UNICA planta fotografada (ex: buva-jovem vs cardo-santo, ou buva vs losna-branca); false ou omitido quando cada item do array e uma planta fisicamente diferente encontrada na foto\",\"indicador_geral\":\"o que indica sobre o solo (so preencher quando hipoteses_mesma_planta for false/omitido)\",\"manejo_integrado\":\"estrategia geral (so preencher quando hipoteses_mesma_planta for false/omitido)\"}";

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("X-Accel-Buffering","no");
  res.flushHeaders();
  // Mesmo truque de padding do /diagnostico — ver comentario la.
  res.write(": " + new Array(8193).join(" ") + "\n\n");

  var ping = setInterval(function(){ try { res.write(": ping\n\n"); } catch(e){ clearInterval(ping); } }, 5000);
  function encerrarDaninha() { clearInterval(ping); try { res.end(); } catch(e){} }

  fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2200,temperature:0,stream:true,
      system:[
        { type:"text", text: sistemaStatic, cache_control:{ type:"ephemeral", ttl:"1h" } },
        { type:"text", text: contexto||"Sem contexto regional adicional." }
      ],
      messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:tipo,data:imagem}}]}]})
  })
  .then(function(r){
    var Readable = require("stream").Readable;
    var stream = Readable.fromWeb(r.body);
    var buf="", texto="", nomeParcialEnviado=false;
    var usageCapturado={input_tokens:0,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0};

    function detectarNomeParcial() {
      if(nomeParcialEnviado) return;
      var m=/"plantas"\s*:\s*\[\s*\{\s*"nome"\s*:\s*"([^"]+)"/.exec(texto);
      if(m){
        res.write("data: "+JSON.stringify({ tipo:"nome_parcial", nome:m[1] })+"\n\n");
        nomeParcialEnviado=true;
      }
    }

    stream.on("data", function(chunk){
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
            detectarNomeParcial();
          }
        }catch(e){}
      });
    });

    stream.on("end", function(){
      var resultado=extrairJSON(texto);
      if(resultado){
        if(!resultado.plantas) resultado={ plantas:[resultado], indicador_geral:resultado.indicador||"", manejo_integrado:resultado.manejo_preventivo||"" };
        if(!resultado.plantas||resultado.plantas.length===0) resultado.plantas=[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}];
      } else {
        console.error("EXTRAIRJSON FALHOU DANINHA. Tamanho texto:", texto.length, "| Ultimos 300 chars:", texto.substring(Math.max(0,texto.length-300)));
        resultado={plantas:[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}],indicador_geral:"",manejo_integrado:""};
      }
      res.write("data: "+JSON.stringify({ tipo:"fim", resultado })+"\n\n");
      logUsoAnalise(userId, "daninha", "claude-sonnet-4-6", usageCapturado, regiao);
      encerrarDaninha();
    });

    stream.on("error", function(e){
      res.write("data: "+JSON.stringify({ tipo:"erro", msg:e.message })+"\n\n");
      encerrarDaninha();
    });
  })
  .catch(function(e){
    res.write("data: "+JSON.stringify({ tipo:"erro", msg:e.message })+"\n\n");
    encerrarDaninha();
  });
});

// ── EXTRATOR JSON ─────────────────────────────────────────────
function extrairJSON(txt) {
  if(!txt) return null;
  txt=txt.replace(/```json/gi,"").replace(/```/g,"").trim();
  try { var ini=txt.indexOf("{"),fim=txt.lastIndexOf("}"); if(ini>-1&&fim>ini) return JSON.parse(txt.substring(ini,fim+1)); } catch(e1){}
  try { var clean=txt.replace(/[\u0000-\u001F\u007F-\u009F]/g," "); var ini=clean.indexOf("{"),fim=clean.lastIndexOf("}"); if(ini>-1&&fim>ini) return JSON.parse(clean.substring(ini,fim+1)); } catch(e2){}
  return null;
}

// Trava determinística (nao depende da IA obedecer o prompt): garante que toda
// ferrugem com confianca baixa peca foto da face de baixo no campo 'acao'.
// Isso e reforco alem da instrucao no prompt — LLM pode ocasionalmente ignorar
// uma instrucao de texto mesmo bem escrita, isso aqui garante 100% das vezes.
var AVISO_FACE_BAIXO = "Fotografe a face de baixo (inferior) desta folha para confirmar. ";
function garantirAvisoFerrugem(resultado) {
  if(!resultado||!resultado.diagnosticos||!resultado.diagnosticos.length) return resultado;
  resultado.diagnosticos.forEach(function(d){
    if(d&&d.diagnostico==="ferrugem"&&d.confianca==="baixa"){
      var acaoAtual=(d.acao||"");
      var jaTemAviso=/face\s*(de\s*)?baixo|face\s*inferior/i.test(acaoAtual);
      if(!jaTemAviso) d.acao=AVISO_FACE_BAIXO+acaoAtual;
    }
  });
  return resultado;
}

// ── GALERIA DE REFERENCIA VISUAL ────────────────────────────────
// Fotos proprias (nao buscadas na web a cada analise — sem custo extra, sem
// risco de direito autoral, sem atraso). Hospedar em:
// https://doutor-cafe-app.vercel.app/referencias/<chave>.jpg
// Basta subir os arquivos com esses nomes exatos na pasta /public/referencias
// do projeto Vercel (doutor-cafe-app) — nao precisa mexer em codigo depois.
// Preencher 1 foto boa e representativa por chave (a legenda pode citar o
// estagio/traço mostrado na foto escolhida).
var BASE_REFERENCIAS = "https://doutor-cafe-app.vercel.app/referencias/";
var REFERENCIAS_VISUAIS = {
  // doencas fungicas
  "ferrugem":          { arquivo:"ferrugem.jpg",          legenda:"Ferrugem: pústulas/pó alaranjado na face de baixo da folha" },
  "cercosporiose":      { arquivo:"cercosporiose.jpg",      legenda:"Cercosporiose: mancha circular com centro branco-acinzentado e halo amarelo fino" },
  "ascochyta":          { arquivo:"ascochyta.jpg",          legenda:"Ascochyta: mancha arredondada marrom-clara com anéis concêntricos" },
  "antracnose":         { arquivo:"antracnose.jpg",         legenda:"Antracnose: lesão afundada preta de bordas irregulares" },
  "phoma":              { arquivo:"phoma.jpg",              legenda:"Phoma: mancha escura pela borda da folha nova, causando encurvamento" },
  "aureolada":          { arquivo:"aureolada.jpg",          legenda:"Aureolada (bacteriana): mancha parda com halo amarelo grande, seca ramos" },
  "mancha_manteigosa":  { arquivo:"mancha_manteigosa.jpg",  legenda:"Mancha manteigosa: lesão encharcada e oleosa" },
  "corynespora":        { arquivo:"corynespora.jpg",        legenda:"Corynespora (mancha-alvo): anéis concêntricos com centro escuro" },
  "koleroga":           { arquivo:"koleroga.jpg",           legenda:"Koleroga: folhas caídas presas por fios de micélio" },
  "amarelinho":         { arquivo:"amarelinho.jpg",         legenda:"Amarelinho (Xylella): ramos com entrenós curtos e declínio geral do vigor" },
  "mancha_anular":      { arquivo:"mancha_anular.jpg",      legenda:"Mancha-anular (leprose): manchas em formato de anel na folha e no fruto" },
  // pragas
  "bicho":              { arquivo:"bicho_mineiro.jpg",      legenda:"Bicho-mineiro: trilhas serpentinas castanhas dentro da folha" },
  "acaro":              { arquivo:"acaro.jpg",              legenda:"Ácaro: folha bronzeada/acinzentada opaca" },
  "cochonilha":         { arquivo:"cochonilha.jpg",         legenda:"Cochonilha: massas brancas algodonosas nos ramos" },
  "broca":              { arquivo:"broca.jpg",              legenda:"Broca: furo circular pequeno no fruto" },
  // deficiencias nutricionais
  "nitrogenio":         { arquivo:"deficiencia_nitrogenio.jpg", legenda:"Deficiência de Nitrogênio: folha toda amarela uniforme (folhas velhas)" },
  "fosforo":            { arquivo:"deficiencia_fosforo.jpg",    legenda:"Deficiência de Fósforo: tom avermelhado/arroxeado em folhas velhas" },
  "magnesio":           { arquivo:"deficiencia_magnesio.jpg",   legenda:"Deficiência de Magnésio: nervuras verdes com tecido amarelo entre elas" },
  "potassio":           { arquivo:"deficiencia_potassio.jpg",   legenda:"Deficiência de Potássio: queima/necrose nas bordas e pontas (folhas velhas)" },
  "ferro":              { arquivo:"deficiencia_ferro.jpg",      legenda:"Deficiência de Ferro: folhas novas esbranquiçadas com nervuras verdes" },
  "calcio":             { arquivo:"deficiencia_calcio.jpg",     legenda:"Deficiência de Cálcio: folhas novas deformadas e encurvadas" },
  "boro":               { arquivo:"deficiencia_boro.jpg",       legenda:"Deficiência de Boro: folhas novas pequenas e quebradiças em roseta" },
  "zinco":              { arquivo:"deficiencia_zinco.jpg",      legenda:"Deficiência de Zinco: folhas novas estreitas e alongadas em roseta" }
};
// So anexa a foto de referencia quando a confianca vier baixa (e' exatamente
// o cenario em que o produtor precisa de mais um jeito de conferir visualmente
// alem do texto). Confianca alta/media nao precisa — o diagnostico ja e' claro.
function anexarReferenciaVisual(resultado) {
  if(!resultado||!resultado.diagnosticos||!resultado.diagnosticos.length) return resultado;
  resultado.diagnosticos.forEach(function(d){
    if(d&&d.confianca==="baixa"){
      var ref=REFERENCIAS_VISUAIS[d.diagnostico];
      if(ref){
        d.imagem_referencia=BASE_REFERENCIAS+ref.arquivo;
        d.imagem_referencia_legenda=ref.legenda;
      }
    }
  });
  return resultado;
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
"REGRA MAIS IMPORTANTE: Liste os problemas que voce consegue identificar com razoavel seguranca a partir dos sinais VISIVEIS na imagem. E melhor ser CONSISTENTE e PRECISO do que detectar muitos problemas. Se um sintoma for ambiguo ou sutil, use confianca 'baixa' e explique a incerteza no campo 'visto' — NUNCA invente um diagnostico especifico para um sinal que poderia ser varias coisas.\n\n"+
"CONSISTENCIA E CALIBRACAO DE CONFIANCA (critico): a mesma folha deve gerar o mesmo diagnostico. Para isso:\n"+
"- confianca 'alta': sintoma CLASSICO e inequivoco, multiplos sinais concordantes. Ex: clorose internerval com nervuras verdes = magnesio.\n"+
"- confianca 'media': sintoma compativel mas nao definitivo, poderia ter 1-2 causas alternativas.\n"+
"- confianca 'baixa': sinal sutil, inicial ou ambiguo. Use quando em duvida — NAO escolha agressivamente entre doencas parecidas.\n"+
"- Priorize o diagnostico pela EVIDENCIA VISUAL mais forte e caracteristica, nao por probabilidade regional.\n"+
"- Se so ha manchas inespecificas sem padrao caracteristico, prefira relatar UM achado de baixa confianca a inventar varios.\n\n"+
"CALIBRACAO DE SEVERIDADE (estagio) — EVITAR INVERSAO ENTRE ANALISES DA MESMA FOLHA (critico):\n"+
"- O campo 'estagio' (1 a 5) so deve diferenciar dois problemas quando a diferenca visual de AVANCO entre eles for CLARA e inequivoca.\n"+
"- Se dois ou mais problemas tem avanco visual SEMELHANTE (ex: duas deficiencias nutricionais ambas moderadas), atribua a eles o MESMO estagio. NAO invente estagios diferentes so para desempatar — isso gera resultados inconsistentes entre analises da mesma folha.\n"+
"- Na duvida entre estagio 1 e 2, use SEMPRE o MENOR (1) e sinalize a incerteza no campo 'visto'. 'estagio 4 ou 5' exige sinais evidentes e extensos de dano.\n"+
"- CUIDADO ESPECIAL com achados de estagio 1 (inicial): esse e o nivel onde mais se erra por excesso de zelo. Antes de incluir um problema em estagio 1, confirme que o TRACO DECISIVO daquele problema especifico esta mesmo presente (nao apenas um sinal generico tipo 'pontinho' ou 'mancha clara' que poderia ser varias coisas). Se restar duvida real, prefira NAO listar o item a listar em estagio 1 por precaucao.\n"+
"- Quando houver empate de severidade entre deficiencias nutricionais, NAO tente ranquear uma acima da outra; no campo 'acao' dessas deficiencias, oriente confirmar a prioridade por analise de solo/foliar antes de ajustar doses.\n"+
"- A ordem de listagem entre itens de MESMA gravidade e MESMO estagio nao e relevante — nao force uma ordem so para preencher; mantenha estavel.\n\n"+
"NAO force NENHUM diagnostico: para CADA item (doenca, praga, deficiencia OU estado de fruto) so relate se o TRACO DECISIVO daquele item estiver CLARAMENTE visivel na foto. Isso vale tanto para ferrugem quanto para deficiencias nutricionais e frutos — sao erros igualmente graves. Exemplos: so diagnostique ferrugem se houver pustulas/po ALARANJADO (manchas amareladas genericas SEM isso NAO sao ferrugem); so diagnostique deficiencia de POTASSIO se houver queima/necrose visivel nas BORDAS/pontas de folhas velhas (fruto ou folha bonitos e verdes ATE A BORDA nao sustentam esse diagnostico); so classifique um fruto como FRUTO_PASSADO se ele estiver visivelmente enrugado/seco/fosco (fruto ESCURO mas LISO e BRILHANTE e cereja madura normal — cor roxo-escura a preta e o PONTO DE COLHEITA, nao um problema); se houver um GRUPO de frutos pretos, secos e mumificados presos ao ramo (nao so 1-2 frutos isolados), considere ANTRACNOSE_FRUTO em vez de fruto_passado, ja que mumificacao em grupo geralmente indica doenca, nao apenas atraso na colheita. Antes de incluir qualquer item na resposta, pergunte-se: 'o traco decisivo especifico deste item esta mesmo visivel, ou estou incluindo por costume/padrao?'. Prefira uma lista MENOR e correta a uma lista maior com itens especulativos.\n\n"+
"DOENCAS FUNGICAS:\nferrugem=pustulas/po ALARANJADO (cor ferrugem, textura de po que suja o dedo) visivel na face INFERIOR da folha - esse e o UNICO sinal aceitavel. Pontinhos amarelos/alaranjados PEQUENOS e LISOS (sem textura de po) na face SUPERIOR, especialmente se a foto so mostra a face de CIMA da folha (face inferior nao visivel), NAO configuram ferrugem sozinhos - podem ser reflexo de luz, respingo de terra/agua, ou picada de inseto. Nesse caso NAO diagnostique ferrugem (omita, ou se quiser sinalizar a suspeita use confianca 'baixa' e peca no campo 'acao' uma foto da face DE BAIXO da folha para confirmar). So use estagio 1 de ferrugem quando a pustula/po, mesmo pequena, for CLARAMENTE visivel e inconfundivel - na duvida entre 'pontinho ambiguo' e pustula real, NAO diagnostique.\ncercosporiose=manchas CIRCULARES com CENTRO BRANCO-ACINZENTADO caracteristico e halo amarelo FINO; ocorre em folha e fruto. ATENCAO: em lavouras novas apos a primeira producao, cercosporiose TAMBEM PODE causar seca de ramos produtivos - a presenca de seca de ramo NAO descarta cercosporiose (nao use isso sozinho para decidir entre cercosporiose e aureolada).\nascochyta=manchas ARREDONDADAS marrom-CLARA (nao escura) com ANEIS CONCENTRICOS, localizadas mais no MEIO do limbo, em folhas VELHAS, halo amarelo extenso, favorecida por clima ameno 15-25C.\nantracnose=lesoes AFUNDADAS pretas bordas irregulares.\nphoma=manchas ESCURAS/negras comecando pelas BORDAS da folha NOVA, causando ENCURVAMENTO da folha (como se fechasse); tambem causa seca de ponteiros nos ramos.\naureolada=BACTERIANA (nao fungica) manchas PARDAS a escuras, SEM o centro branco-acinzentado tipico da cercosporiose, com halo amarelo GRANDE e mais difuso (bem mais largo que o halo fino da cercosporiose); pode causar seca de ramos laterais/ponteiros em cafeeiros novos. TRACO DECISIVO vs cercosporiose: presenca ou ausencia do CENTRO BRANCO-ACINZENTADO na mancha - se a mancha tem esse centro claro, e cercosporiose (mesmo com seca de ramo presente); se a mancha e parda/escura uniforme SEM centro claro e o halo e bem largo, e aureolada.\namarelinho=BACTERIA SISTEMICA (Xylella fastidiosa, nao fungica, SEM CURA quimica - exige arranquio da planta). Sintomas: necrose e queda foliar progressiva, reducao do crescimento com RAMOS DE ENTRENOS CURTOS (internodios curtos), declinio GERAL e PROGRESSIVO de vigor da planta inteira, podendo evoluir a morte lenta. ATENCAO CRITICA: o aspecto de entrenos curtos PODE SE PARECER com deficiencia de zinco (folhas novas estreitas em roseta) - a diferenca e que amarelinho traz declinio geral do vigor de toda a planta, nao so as folhas novas, e NAO melhora com adubacao foliar de zinco. Se houver duvida real entre os dois, use confianca 'media', mencione ambas possibilidades no campo 'acao' e recomende avaliacao presencial de um agronomo antes de aplicar zinco, pois os tratamentos sao completamente diferentes.\nmancha_anular=VIROSE (Coffee ringspot virus / leprose-do-cafeeiro, transmitida pelo acaro Brevipalpus phoenicis, SEM CURA quimica direta). Sinal DECISIVO: manchas em FORMATO DE ANEL (cloroticas ou necroticas), podendo ser alongadas acompanhando a nervura da folha; nos frutos aparecem como aneis irregulares na fase cereja, deprimidos ou nao. Controle e indireto, via manejo do acaro-vetor.\nmancha_manteigosa=manchas ENCHARCADAS OLEOSAS.\ncorynespora=MANCHA-ALVO: manchas ARREDONDADAS ate 2cm com ANEIS CONCENTRICOS e um PONTO/CENTRO ESCURO no meio (aspecto de alvo de tiro), cor castanho-clara a escura, halo amarelo, geralmente em folhas mais baixas/velhas.\nkoleroga=FOLHAS CAIDAS presas por FIOS DE MICELIO.\n\n"+
"PRAGAS:\nbicho=TRILHAS SERPENTINAS castanhas dentro da folha.\nacaro=folha BRONZEADA/acinzentada opaca, pode evoluir para AMARELECIDA com queda precoce.\ncochonilha=massas BRANCAS algodonosas em ramos.\nbroca=FURO CIRCULAR 1-2mm no FRUTO.\n\n"+
"DEFICIENCIAS:\nnitrogenio=folha TODA AMARELA UNIFORME (inclusive nervuras) folhas velhas.\nfosforo=folhas VELHAS com tonalidade AVERMELHADA/AROXEADA (bronzeado-vinho), especialmente no pecíolo e nervuras, pode ter manchas necroticas escuras; folha mantem-se pequena e planta com crescimento lento. Comum em solo acido (baixo P disponivel).\nmagnesio=nervuras VERDES tecido AMARELO internerval (a folha fica com um padrao de rede: veias verdes contra fundo amarelo), folhas velhas — o tecido fica AMARELO mas GERALMENTE NAO morre/nao fica marrom seco.\npotassio=QUEIMA/necrose SECA E MARROM concentrada na BORDA e PONTA da folha (tecido realmente morto, nao so amarelo), folhas velhas.\nATENCAO CRITICA POTASSIO vs MAGNESIO — ERRO COMUM: quando a folha tiver doenca fungica ativa (ex: cercosporiose) E tambem uma area marrom seca perto da ponta/borda, NAO cravar deficiencia automaticamente so por ver essa area marrom — primeiro pergunte: essa necrose esta GRUDADA/conectada a uma lesao de doenca (extensao do dano do fungo) ou e uma queima SEPARADA e mais AMPLA/UNIFORME ao longo de toda a borda da folha, independente de onde estao as lesoes? So classifique como potassio se a queima for um padrao proprio de queima marginal (nao apenas o fungo avancando). Se restar duvida real entre marcar so a doenca ou tambem incluir deficiencia, prefira confianca 'baixa' na deficiencia em vez de alternar aleatoriamente entre potassio e magnesio.\nferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\ncalcio=folhas NOVAS deformadas ENCURVADAS.\nboro=folhas NOVAS pequenas QUEBRADICAS asperas, agrupadas formando ROSETA/tufo nos ponteiros, pode secar a gema terminal.\nzinco=folhas NOVAS ESTREITAS e alongadas (nao quebradicas) tambem formando roseta; DIFERENCA do boro: zinco = folha fina/estreita tipo lanceta, boro = folha quebradica e aspera ao tato.\n\n"+
"CAUSAS ABIOTICAS (NAO sao doenca/praga - sao danos de clima, vento ou manejo que IMITAM sintomas de doenca; considere estas opcoes quando os sinais NAO batem bem com nenhuma entrada biotica acima):\nvento_frio=seca de PONTEIROS e RAMOS LATERAIS, folhas novas com bordas queimadas/necrosadas em plantas expostas a vento, SEM relacao com lesao fungica/bacteriana especifica.\ngeada_frio=necrose na 'canela' (base do caule) de plantas jovens; amarelecimento, murcha e morte podem aparecer só 5 a 9 MESES depois de um frio intenso (efeito retardado).\nescaldadura=queima/necrose do tecido foliar ou do fruto na area de MAIOR EXPOSICAO DIRETA AO SOL forte, sem relacao com fungo.\nfitotoxicidade=amarelecimento, queima, deformacao ou necrose SURGIDOS LOGO APOS aplicacao de defensivo/adubo foliar (verificar se houve aplicacao recente); tambem pode ocorrer por concentracao de adubo no colo.\nestresse_hidrico=murcha, amarelecimento e seca GENERALIZADA das folhas em periodo de estiagem/deficit hidrico prolongado, sem lesao localizada especifica.\ndano_mecanico=lesao ou ferimento IRREGULAR associado a maquina, ferramenta, raiz torta de plantio malfeito ou afogamento do colo (plantio fundo/amontoa excessiva).\nSe os sintomas parecerem mais com uma causa abiotica do que com qualquer doenca/praga/deficiencia listada acima, use um desses 6 nomes no campo \"diagnostico\", confianca conforme a certeza observada, fungicidas:[], e no campo 'acao' explique a causa abiotica suspeita e a medida corretiva pratica (ex: instalar quebra-vento, ajustar sombreamento, corrigir irrigacao, rever aplicacao de defensivo).\n\n"+
"FRUTOS:\nfruto_verde=verde firme sem lesoes.\nfruto_maduro=VERMELHO ou AMARELO cereja brilhante; fruto ROXO-ESCURO/QUASE PRETO mas LISO e BRILHANTE tambem e CEREJA MADURA NORMAL (ponto de colheita), NAO e fruto_passado.\nfruto_passado=fruto ISOLADO escurecido e ALEM DISSO visivelmente ENRUGADO/MURCHO/FOSCO por ter passado do ponto de colheita (problema de MANEJO/COLHEITA, nao doenca) — cor escura sozinha, sem enrugamento visivel, NAO basta para este diagnostico.\nbroca=FURO CIRCULAR escuro 1-2mm.\nantracnose_fruto=lesoes AFUNDADAS CIRCULARES marrom-escuras NUM fruto, OU um GRUPO/CACHO de frutos completamente PRETOS, SECOS e MUMIFICADOS presos ao ramo (aspecto de 'passas coladas no galho') — isso e DOENCA (antracnose), NAO fruto_passado, mesmo que a cor pareca parecida. DIFERENCA CHAVE: fruto_passado e um problema de COLHEITA (1-2 frutos isolados, textura de passa mas casca ainda reconhecivel); frutos MUMIFICADOS por antracnose aparecem em GRUPO/CACHO, completamente enegrecidos e ressecados, muitas vezes AGARRADOS uns aos outros ou ao ramo, e pedem fungicida + remocao manual (nao so colheita).\n\n"+
"PRODUTOS:\nferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.75 unidade_proporcao:mL intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\ncercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\nascochyta: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\nantracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\nantracnose_fruto: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14 obs:remover_manualmente_frutos_mumificados_e_destruir_fora_da_lavoura_para_reduzir_fonte_de_inoculo. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\nphoma: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14. Mancozebe 800WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\naureolada: ATENCAO doenca BACTERIANA nao fungica — fungicida sistemico triazol NAO tem efeito, usar SOMENTE cupricos com acao bactericida. Oxicloreto Cobre 840WP protetor 4-4,5kg/ha proporcao_por_litro:4 unidade_proporcao:g intervalo:15 obs:acao_bactericida. Hidroxido Cobre 770WG protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:15 obs:acao_bactericida.\nmancha_manteigosa: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\ncorynespora: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:14.\nkoleroga: Oxicloreto Cobre 840WP protetor 2,5-3kg/ha proporcao_por_litro:3 unidade_proporcao:g intervalo:14 obs:associar_desbaste_ramos_internos_e_poda_para_ventilacao.\nbicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha proporcao_por_litro:0.1 unidade_proporcao:g intervalo:30.\nacaro: Abamectina 18EC acaricida 0,5-0,75L/ha proporcao_por_litro:0.5 unidade_proporcao:mL intervalo:21.\ncochonilha: Imidacloprido 700WG inseticida 0,3-0,5kg/ha proporcao_por_litro:0.4 unidade_proporcao:g intervalo:30.\nbroca: Clorpirifos 480EC inseticida 1,5-2L/ha proporcao_por_litro:1.75 unidade_proporcao:mL intervalo:30.\n\n"+
"REGRA OBRIGATORIA PARA FERRUGEM COM CONFIANCA BAIXA: se voce incluir 'ferrugem' com confianca 'baixa' por ter visto so a face SUPERIOR da folha (sem confirmar pustula/po na face inferior), o campo 'acao' desse item DEVE comecar EXATAMENTE com a frase 'Fotografe a face de baixo (inferior) desta folha para confirmar' antes de qualquer outra orientacao ou produto. Isso e obrigatorio, nao opcional — nao pule essa frase mesmo que o resto da resposta va bem.\n\n"+
"INSTRUCOES FINAIS: Relate os problemas com evidencia visual real, ordenados por GRAVIDADE (doenca/praga ativa primeiro, depois deficiencias) e dentro da mesma gravidade por ordem de CONFIANCA (alta antes de baixa). Deficiencias nutricionais, amarelinho, mancha_anular e causas abioticas (vento_frio, geada_frio, escaldadura, fitotoxicidade, estresse_hidrico, dano_mecanico): fungicidas:[] (nao ha controle quimico direto para essas categorias). Use confianca 'baixa' quando o sinal for ambiguo em vez de arriscar um diagnostico especifico errado. So retorne saudavel se a folha estiver realmente sem sintomas visiveis.\n"+
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
