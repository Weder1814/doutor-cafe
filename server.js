var express = require("express");
var cors = require("cors");
var fs = require("fs");
var path = require("path");
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
        foto_perfil   TEXT,
        plano         TEXT DEFAULT 'gratuito',
        plano_id      TEXT,
        analises_usadas INTEGER DEFAULT 0,
        videos_usados INTEGER DEFAULT 0,
        mes_reset     TEXT DEFAULT '',
        criado_em     TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil TEXT;
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
    // Trava contra colisao de PIN (30/07/2026) — impede duas contas com o
    // mesmo PIN, que causava login sempre cair na conta errada (LIMIT 1 sem
    // ORDER BY pegava qualquer uma das duplicadas). Indice PARCIAL (so pin
    // nao-vazio) porque muitas contas antigas tem pin='' e isso e permitido
    // continuar existindo em varias linhas — so pin PREENCHIDO precisa ser
    // unico. Em try/catch proprio: se ainda houver duplicata de pin != ''
    // no banco quando isso rodar, a criacao falha silenciosamente (so loga)
    // sem derrubar o resto da inicializacao — resolve a duplicata primeiro
    // via /admin/resolver-colisao-pin, depois reinicia o servico pra essa
    // trava pegar de vez.
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_pin_unico ON usuarios (pin) WHERE pin <> ''`);
    } catch(ePin) {
      console.warn("⚠️ Nao foi possivel criar indice unico de PIN (provavelmente ainda ha duplicatas): " + ePin.message);
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cache_preco_cafe (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        dados       JSONB,
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── ÍNDICES EXTRAS (performance ao escalar) ────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_pin    ON usuarios(pin)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_analises_criado ON analises(user_id, criado_em DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagamentos_user ON pagamentos(user_id)`);

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

// ── DIAGNOSTICO: colisao de PIN (30/07/2026, temporario) ─────────
// Investigando bug de login: PIN sempre retorna a mesma conta errada,
// mesmo depois de sair e entrar de novo. Suspeita: dbGetUserByPin usa
// "LIMIT 1" sem ORDER BY — se duas contas tiverem o mesmo PIN, a busca
// sempre pega a mesma linha (nao necessariamente a certa), de forma
// consistente. Esse endpoint so LE dados, nao muda nada, e nao expõe
// nada alem do necessario pra confirmar a colisao.
app.get("/admin/checar-pin/:pin", async function(req, res) {
  if (!adminAutorizado(req)) return res.status(403).json({ erro:"Nao autorizado." });
  var pin = (req.params.pin||"").replace(/[^0-9]/g,"");
  if (!pool) return res.json({ erro:"Sem banco Postgres configurado (rodando em memoria)." });
  try {
    var r = await pool.query(
      "SELECT user_id, nome, celular, plano, analises_usadas, criado_em FROM usuarios WHERE pin=$1 ORDER BY criado_em ASC",
      [pin]
    );
    res.json({ pin: pin, total_contas_com_esse_pin: r.rows.length, contas: r.rows });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Resolve colisao de PIN: mantem o PIN so na conta indicada (manterUserId),
// apaga o PIN (deixa em branco) das outras que tinham o mesmo PIN. Nao
// apaga a conta em si, nem historico, nem plano — so o campo pin, pra
// ela parar de ser encontrada por esse PIN especifico. O dono dela ainda
// pode logar por celular/CPF se precisar recuperar essa conta depois.
// Versao GET do endpoint acima, so pra ser acionavel colando um link
// direto no navegador do celular (sem precisar de DevTools/Console).
// Mesma logica, mesma protecao por senha.
app.get("/admin/resolver-colisao-pin", async function(req, res) {
  if (!adminAutorizado(req)) return res.status(403).json({ erro:"Nao autorizado." });
  var pin = (req.query.pin||"").replace(/[^0-9]/g,"");
  var manterUserId = req.query.manterUserId;
  if (!pin || !manterUserId) return res.status(400).json({ erro:"Informe pin e manterUserId na URL (?pin=...&manterUserId=...)." });
  if (!pool) return res.json({ erro:"Sem banco Postgres configurado." });
  try {
    var afetados = await pool.query(
      "UPDATE usuarios SET pin='' WHERE pin=$1 AND user_id <> $2 RETURNING user_id, nome, celular",
      [pin, manterUserId]
    );
    res.json({ ok:true, pin_mantido_em: manterUserId, contas_com_pin_removido: afetados.rows });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

app.post("/admin/resolver-colisao-pin", async function(req, res) {
  if (!adminAutorizado(req)) return res.status(403).json({ erro:"Nao autorizado." });
  var pin = (req.body.pin||"").replace(/[^0-9]/g,"");
  var manterUserId = req.body.manterUserId;
  if (!pin || !manterUserId) return res.status(400).json({ erro:"Informe pin e manterUserId." });
  if (!pool) return res.json({ erro:"Sem banco Postgres configurado." });
  try {
    var afetados = await pool.query(
      "UPDATE usuarios SET pin='' WHERE pin=$1 AND user_id <> $2 RETURNING user_id, nome, celular",
      [pin, manterUserId]
    );
    res.json({ ok:true, pin_mantido_em: manterUserId, contas_com_pin_removido: afetados.rows });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

async function dbSaveUser(u) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO usuarios (user_id,cpf,celular,nome,pin,email,regiao,foto_perfil,plano,analises_usadas,mes_reset)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (user_id) DO UPDATE SET
          cpf=EXCLUDED.cpf, celular=EXCLUDED.celular, nome=EXCLUDED.nome,
          pin=EXCLUDED.pin, email=EXCLUDED.email, regiao=EXCLUDED.regiao,
          foto_perfil=EXCLUDED.foto_perfil,
          plano=EXCLUDED.plano, analises_usadas=EXCLUDED.analises_usadas,
          mes_reset=EXCLUDED.mes_reset, atualizado_em=NOW()
      `, [u.userId||u.user_id, u.cpf||"", u.celular||"", u.nome||"",
          u.pin||"", u.email||"", u.regiao||"", u.fotoPerfil||u.foto_perfil||"",
          u.plano||"gratuito", u.analisesUsadas||0, u.mesReset||""]);
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

// ══════════════════════════════════════════════════════════════════
// GOOGLE PLAY BILLING — verificacao de compra e RTDN (28/07/2026)
// ══════════════════════════════════════════════════════════════════
// Substitui o Mercado Pago no fluxo de assinatura DENTRO do app Android,
// exigido pela politica do Google Play (fluxos de pagamento dentro do
// app precisam usar o sistema de cobranca do Google Play no Brasil ate
// a flexibilizacao chegar por aqui, prevista so pra 2027).
//
// SETUP NECESSARIO NO GOOGLE CLOUD / PLAY CONSOLE (fazer uma vez, fora
// do codigo):
//   1. No Google Cloud Console, habilitar a "Android Publisher API" no
//      mesmo projeto vinculado ao Play Console.
//   2. Criar uma Service Account nesse projeto GCP, gerar uma chave JSON.
//   3. No Play Console → Configuracoes → Acesso a API, vincular essa
//      service account e dar a ela permissao "Ver dados financeiros" e
//      "Gerenciar pedidos e assinaturas" (Financial data + Orders).
//   4. Colar o CONTEUDO INTEIRO do arquivo JSON da chave como uma unica
//      variavel de ambiente no Railway: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
//   5. No Play Console → Monetizacao → Notificacoes em tempo real,
//      configurar um topico do Google Cloud Pub/Sub e apontar a
//      assinatura push desse topico para:
//      https://doutor-cafe-production.up.railway.app/webhook-play-rtdn
//
// Pacote Android: app.doutorcafe.diagnostico (confirmar se nao mudou)
var PACKAGE_NAME_ANDROID = "app.doutorcafe.diagnostico";

function base64urlSemPadding(buf) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Troca a chave da service account por um access token OAuth2 valido
// por 1h. Implementado so com o modulo nativo 'crypto' do Node, sem
// depender de instalar a lib 'googleapis' (evita risco de dependencia
// faltando no deploy).
var _googlePlayTokenCache = { token:null, expira:0 };
async function getGooglePlayAccessToken() {
  if (_googlePlayTokenCache.token && Date.now() < _googlePlayTokenCache.expira) {
    return _googlePlayTokenCache.token;
  }
  var credJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credJson) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON nao configurada no Railway.");
  var cred = JSON.parse(credJson);
  var crypto = require('crypto');
  var agora = Math.floor(Date.now()/1000);
  var header = { alg:"RS256", typ:"JWT" };
  var claim = {
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    exp: agora + 3600,
    iat: agora
  };
  var naoAssinado = base64urlSemPadding(Buffer.from(JSON.stringify(header))) + "." + base64urlSemPadding(Buffer.from(JSON.stringify(claim)));
  var assinador = crypto.createSign("RSA-SHA256");
  assinador.update(naoAssinado);
  assinador.end();
  var assinatura = base64urlSemPadding(assinador.sign(cred.private_key));
  var jwt = naoAssinado + "." + assinatura;

  var r = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + encodeURIComponent(jwt)
  });
  var data = await r.json();
  if (!data.access_token) throw new Error("Falha ao obter token OAuth2 do Google: " + JSON.stringify(data));
  _googlePlayTokenCache = { token: data.access_token, expira: Date.now() + (data.expires_in||3500)*1000 };
  return data.access_token;
}

// Consulta o estado real de uma assinatura na Google Play Developer API
// (subscriptionsv2, a versao atual recomendada — a antiga 'subscriptions'
// esta em descontinuacao).
async function consultarAssinaturaPlay(purchaseToken) {
  var accessToken = await getGooglePlayAccessToken();
  var url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
    + PACKAGE_NAME_ANDROID + "/purchases/subscriptionsv2/tokens/" + encodeURIComponent(purchaseToken);
  var r = await fetch(url, { headers:{ "Authorization":"Bearer "+accessToken } });
  var data = await r.json();
  if (data.error) throw new Error("Erro na Play Developer API: " + JSON.stringify(data.error));
  return data;
}

// Confirma (acknowledge) a compra — OBRIGATORIO fazer isso em ate 3 dias
// depois da compra, senao o Google reembolsa automaticamente o usuario.
// Usa o endpoint da API v3 'subscriptions' (nao subscriptionsv2) que e
// onde o acknowledge realmente vive por enquanto.
async function confirmarCompraPlay(productId, purchaseToken) {
  var accessToken = await getGooglePlayAccessToken();
  var url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
    + PACKAGE_NAME_ANDROID + "/purchases/subscriptions/" + encodeURIComponent(productId)
    + "/tokens/" + encodeURIComponent(purchaseToken) + ":acknowledge";
  var r = await fetch(url, { method:"POST", headers:{ "Authorization":"Bearer "+accessToken, "Content-Type":"application/json" }, body:"{}" });
  if (!r.ok) { var t=await r.text(); console.error("Falha ao confirmar compra Play (pode ja estar confirmada):", t); }
}

// Ativa o plano no banco a partir do estado retornado pela Play API.
// basePlanId precisa bater com uma chave de PLANOS (ex: "basico_mensal").
async function ativarPlanoPelaPlay(userId, basePlanId, purchaseToken, valor) {
  var tipo = basePlanId.indexOf("premium")>-1?"premium":basePlanId.indexOf("pro")>-1?"pro":"basico";
  await dbAtualizarPlano(userId, tipo, basePlanId);
  if (pool) {
    await pool.query(
      "INSERT INTO pagamentos (id,user_id,plano_id,status,valor) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [purchaseToken.substring(0,120), userId, basePlanId, "approved", valor||0]
    );
  }
  console.log("✅ [Play Billing] Plano", tipo, "ativado para", userId);
  return tipo;
}

// Chamado pelo app logo apos o usuario completar a compra via
// PaymentRequest/Digital Goods API. Verifica o token direto na Play API
// antes de liberar o plano — nunca confia soh no que o cliente informa.
app.post("/verificar-compra-play", async function(req, res) {
  var userId = req.body.userId;
  var productId = req.body.productId;       // SKU cadastrado no Play Console, ex: "plano_basico"
  var basePlanId = req.body.basePlanId;      // ex: "basico_mensal" — precisa bater com chave de PLANOS
  var purchaseToken = req.body.purchaseToken;
  if (!userId || !productId || !basePlanId || !purchaseToken) {
    return res.status(400).json({ erro:"Campos obrigatorios: userId, productId, basePlanId, purchaseToken" });
  }
  var plano = PLANOS[basePlanId];
  if (!plano) return res.status(400).json({ erro:"basePlanId invalido: "+basePlanId });
  try {
    var dadosCompra = await consultarAssinaturaPlay(purchaseToken);
    var estado = dadosCompra.subscriptionState;
    if (estado !== "SUBSCRIPTION_STATE_ACTIVE") {
      return res.status(402).json({ erro:"Assinatura nao esta ativa segundo a Google Play.", estado: estado });
    }
    var tipo = await ativarPlanoPelaPlay(userId, basePlanId, purchaseToken, plano.valor);
    try { await confirmarCompraPlay(productId, purchaseToken); } catch(eAck) { console.error("Erro ao confirmar compra:", eAck.message); }
    res.json({ ok:true, tipo:tipo, plano:basePlanId });
  } catch(e) {
    console.error("Erro ao verificar compra Play:", e.message);
    res.status(500).json({ erro:e.message });
  }
});

// Webhook das Real-time Developer Notifications (RTDN), via Pub/Sub push.
// O Google chama esse endpoint automaticamente quando uma assinatura
// renova, e cancelada, entra em atraso, etc — sem o usuario estar com
// o app aberto. Mapa de notificationType conforme documentacao oficial:
//   1=RECOVERED 2=RENEWED 3=CANCELED 4=PURCHASED 5=ON_HOLD
//   6=IN_GRACE_PERIOD 7=RESTARTED 8=PRICE_CHANGE_CONFIRMED 9=DEFERRED
//   10=PAUSED 11=PAUSE_SCHEDULE_CHANGED 12=REVOKED 13=EXPIRED
//   14=PENDING_PURCHASE_CANCELED
app.post("/webhook-play-rtdn", async function(req, res) {
  try {
    var msg = req.body && req.body.message;
    if (!msg || !msg.data) return res.status(200).json({ ok:true });
    var payload = JSON.parse(Buffer.from(msg.data, "base64").toString("utf8"));
    console.log("RTDN Play recebido:", JSON.stringify(payload).substr(0,300));
    var notif = payload.subscriptionNotification;
    if (!notif || !notif.purchaseToken) return res.status(200).json({ ok:true });

    var tipoNotif = notif.notificationType;
    var purchaseToken = notif.purchaseToken;

    // Acha qual usuario esse purchaseToken pertence (foi salvo como "id"
    // na tabela pagamentos na hora da compra inicial).
    var userId = null, basePlanId = null;
    if (pool) {
      var r = await pool.query("SELECT user_id, plano_id FROM pagamentos WHERE id = $1 ORDER BY criado_em DESC LIMIT 1", [purchaseToken.substring(0,120)]);
      if (r.rows[0]) { userId = r.rows[0].user_id; basePlanId = r.rows[0].plano_id; }
    }
    if (!userId) {
      console.error("RTDN Play: purchaseToken nao encontrado na tabela pagamentos, ignorando:", purchaseToken.substring(0,40));
      return res.status(200).json({ ok:true });
    }

    if (tipoNotif===2 || tipoNotif===1 || tipoNotif===7) {
      // Renovado, recuperado ou reiniciado -> reconfirma que esta ativo
      var dados = await consultarAssinaturaPlay(purchaseToken);
      if (dados.subscriptionState==="SUBSCRIPTION_STATE_ACTIVE" && basePlanId) {
        await ativarPlanoPelaPlay(userId, basePlanId, purchaseToken, (PLANOS[basePlanId]||{}).valor);
      }
    } else if (tipoNotif===3 || tipoNotif===12 || tipoNotif===13) {
      // Cancelado, revogado ou expirado -> rebaixa pro plano gratuito
      await dbAtualizarPlano(userId, "gratuito", null);
      console.log("⬇️ [Play Billing] Plano rebaixado pra gratuito:", userId, "(notificationType", tipoNotif+")");
    }
    // Os demais tipos (5 on_hold, 6 grace period, 9 deferred, 10 paused,
    // 11 pause_schedule, 14 pending_cancel) sao informativos — por ora
    // so logamos, sem mudar o plano do usuario automaticamente. Revisar
    // se isso precisa de tratamento proprio conforme o volume de uso.

    res.status(200).json({ ok:true });
  } catch(e) {
    console.error("Erro no webhook RTDN Play:", e.message);
    // Sempre responde 200 pro Google Pub/Sub nao ficar re-entregando a
    // mesma mensagem em loop indefinidamente por causa de um erro nosso.
    res.status(200).json({ ok:true });
  }
});

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
  "claude-haiku-4-5-20251001":  { input: 0.80,  output: 4.00  },
  "qwen2.5-vl-72b-instruct":    { input: 0.25,  output: 0.75  },
  "qwen-vl-max":                { input: 0.80,  output: 3.20  }, // confirmado na pagina de precos do Model Studio
  "qwen3.7-plus":               { input: 0.40,  output: 1.60  }  // confirmado na pagina de precos do Model Studio (preco padrao, sem o desconto temporario de 20%)
};

// Normaliza o "usage" no formato OpenAI/OpenRouter (prompt_tokens/completion_tokens)
// para o formato Anthropic (input_tokens/output_tokens) usado por logUsoAnalise
// e calcularCustoUSD em todo o resto do arquivo — assim nao precisa duplicar
// essas duas funcoes so por causa do provedor diferente.
function normalizarUsageOpenRouter(usage) {
  if (!usage) return { input_tokens:0, output_tokens:0 };
  return {
    input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
    output_tokens: usage.completion_tokens || usage.output_tokens || 0
  };
}

// ── TROCA TEMPORARIA DE MODELO PARA TESTE (Sonnet -> Qwen) ──────
// Ativado a pedido do Dinho para rodar 5 fotos de teste no app real
// com Qwen no lugar de Sonnet/Haiku em TODOS os endpoints de producao.
// PARA REVERTER: troque MODELO_PRODUCAO de volta para "claude-sonnet-4-6"
// (ou crie uma logica separada por endpoint se quiser granularidade).
// Endpoints afetados: /diagnostico, /diagnostico-json, /diagnostico-video,
// /analise-solo, /identifica-daninha, /plano-acao, /identifica-defeito-grao.
// NAO afetado (mantido em Sonnet de proposito): /gerar-exemplo-treino,
// que usa a Sonnet como "professora" para o dataset de fine-tuning.
// ── TROCA TEMPORARIA DE MODELO PARA TESTE (Sonnet -> Qwen, agora DIRETO
// na Alibaba Cloud, sem passar pelo OpenRouter) ──────────────────────
// Ativado a pedido do Dinho para rodar testes no app real com Qwen no
// lugar de Sonnet/Haiku. Migrado do OpenRouter pra Alibaba Cloud Model
// Studio (DashScope) direto porque o OpenRouter reparte a mesma chamada
// entre varios provedores terceiros (Nebius, Parasail, etc.) com leves
// diferencas de configuracao/quantizacao entre eles — isso causava a
// MESMA foto dar diagnosticos diferentes em celulares diferentes no
// mesmo dia. Chamando direto na Alibaba (dona do modelo), essa fonte de
// instabilidade desaparece, igual a Sonnet ja e chamada direto na
// Anthropic sem intermediario.
// PARA REVERTER PARA SONNET: troque MODELO_PRODUCAO de volta e restaure
// as chamadas para api.anthropic.com (ver historico do arquivo).
// Endpoints afetados: /diagnostico, /diagnostico-json, /diagnostico-video,
// /analise-solo, /identifica-daninha, /plano-acao, /identifica-defeito-grao.
// NAO afetado (mantido em Sonnet de proposito): /gerar-exemplo-treino.
// ── MODELO DE PRODUCAO: Sonnet -> Qwen3.7-Plus (27/07/2026) ─────────
// Troca decidida apos rodada extensa de testes comparativos no mesmo dia
// (9 fotos reais, ver teste-comparacao.html): Qwen3.7-Plus bateu com a
// Sonnet no diagnostico principal em 8 de 9 fotos, e no unico caso de
// discordancia real foi a SONNET quem errou (confirmado pelo Dinho em
// campo). Motivo da troca: ~5-8x mais barato e 2-3x mais rapido que
// Sonnet, mantendo qualidade equivalente nos testes rodados.
// Ativado durante a ultima semana de testes fechados no Google Play —
// bom momento pra validar com os testadores reais alem dos testes manuais.
// RISCOS CONHECIDOS A MONITORAR (nao totalmente resolvidos nos testes):
//   1. Achados SECUNDARIOS (multiplas condicoes coexistindo na mesma foto)
//      tendem a ser menos completos que a Sonnet — Qwen aplicou a correcao
//      de varredura por regiao (frutos vs folhas) mas ainda errou um caso
//      de subgrupos DENTRO do mesmo aglomerado de frutos (fruto_passado
//      coexistindo com antracnose_fruto). Ajuste feito em INSTRUCAO_TESTE_EXTRA
//      em 27/07/2026, MAS NAO RE-TESTADO ainda apos esse ajuste especifico.
//   2. Estagio de severidade (ex: ferrugem estagio 3 vs 4) pode divergir
//      mesmo quando o diagnostico principal bate.
//   3. analise-solo, identifica-daninha, plano-acao e identifica-defeito-grao
//      NAO foram testados com fotos reais nesta rodada — so /diagnostico-json
//      foi validado. Monitore esses endpoints com atencao extra.
// PARA REVERTER PARA SONNET: troque MODELO_PRODUCAO para "claude-sonnet-4-6",
// URL_MODELO_PRODUCAO para "https://api.anthropic.com/v1/messages", e
// restaure o formato de chamada Anthropic (system+x-api-key), ver historico
// do arquivo ou o endpoint /gerar-exemplo-treino (mantido em Sonnet) como
// referencia de como montar essa chamada.
// Endpoints afetados: /diagnostico, /diagnostico-json, /diagnostico-video,
// /analise-solo, /identifica-daninha, /plano-acao, /identifica-defeito-grao.
// NAO afetado (mantido em Sonnet de proposito): /gerar-exemplo-treino,
// que usa a Sonnet como "professora" para o dataset de fine-tuning.
var MODELO_PRODUCAO = "qwen3.7-plus";
var MODELO_PRODUCAO_LOG = "qwen3.7-plus";
var URL_MODELO_PRODUCAO = "https://ws-qmtud7hcd86gxmha.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"; // endpoint dedicado do workspace (Singapore) — mais estavel que o generico
function headersModeloProducao() {
  return { "Content-Type":"application/json", "Authorization":"Bearer "+process.env.DASHSCOPE_API_KEY };
}
// Fixar provedor era so relevante no OpenRouter (varios provedores por
// tras do mesmo nome). Chamando direto na Alibaba nao existe esse
// conceito — corpoModeloProducao devolve o corpo como veio, exceto que
// forca enable_thinking:false para modelos Qwen3.x (calibrado em
// 27/07/2026: sem isso o Qwen3.7-Plus roda em modo thinking por padrao,
// levando 50-100s e milhares de tokens de raciocinio interno por analise —
// inviavel para producao tanto em latencia quanto em custo).
function corpoModeloProducao(campos) {
  if (campos.model && campos.model.indexOf("qwen3") === 0 && campos.enable_thinking === undefined) {
    campos.enable_thinking = false;
  }
  return campos;
}

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
  var fotoPerfil = req.body.fotoPerfil||""; // base64 (data URL sem o prefixo "data:image/...;base64,")

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
        fotoPerfil: fotoPerfil || jaTemEsseId.foto_perfil || "",
        plano: jaTemEsseId.plano || "gratuito",
        analisesUsadas: jaTemEsseId.analises_usadas || jaTemEsseId.analisesUsadas || 0,
        mesReset: jaTemEsseId.mes_reset || jaTemEsseId.mesReset || ""
      });
      return res.json({
        ok:true, userId:userId, jaExistia:true,
        plano: jaTemEsseId.plano||"gratuito",
        analisesUsadas: jaTemEsseId.analises_usadas||jaTemEsseId.analisesUsadas||0,
        analisesRestantes: analisesRestantes(jaTemEsseId),
        nome: nome,
        fotoPerfil: fotoPerfil || jaTemEsseId.foto_perfil || ""
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
        analisesRestantes: analisesRestantes(existente),
        nome: existente.nome||nome,
        fotoPerfil: existente.foto_perfil||""
      });
    }

    // 3. Usuario genuinamente novo — so aqui comeca com 0 analises usadas.
    await dbSaveUser({ userId, cpf, celular, nome, pin, email, regiao, fotoPerfil, plano:"gratuito", analisesUsadas:0, mesReset:"" });
    res.json({ ok:true, userId, nome, fotoPerfil, analisesRestantes: LIMITES.gratuito });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── PERFIL: buscar nome/foto (pra tela inicial) e atualizar so a foto ──
app.get("/perfil-usuario", async function(req, res) {
  var userId = req.query.userId;
  if (!userId) return res.status(400).json({ erro:"userId obrigatorio." });
  try {
    var u = await dbGetUser(userId);
    if (!u) return res.status(404).json({ erro:"Usuario nao encontrado." });
    res.json({ ok:true, nome: u.nome||"", fotoPerfil: u.foto_perfil||"" });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

app.post("/atualizar-foto-perfil", async function(req, res) {
  var userId = req.body.userId;
  var fotoPerfil = req.body.fotoPerfil||""; // base64 (data URL sem o prefixo)
  if (!userId) return res.status(400).json({ erro:"userId obrigatorio." });
  try {
    var u = await dbGetUser(userId);
    if (!u) return res.status(404).json({ erro:"Usuario nao encontrado." });
    await dbSaveUser({
      userId: userId, cpf: u.cpf||"", celular: u.celular||"", nome: u.nome||"",
      pin: u.pin||"", email: u.email||"", regiao: u.regiao||"",
      fotoPerfil: fotoPerfil, plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||0, mesReset: u.mes_reset||""
    });
    res.json({ ok:true, fotoPerfil: fotoPerfil });
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
      fotoPerfil: u.foto_perfil||"",
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

  // Cancela a chamada pra Anthropic se o cliente desconectar (timeout do app,
  // fila offline reenfileirando, app fechado) — sem isso, a analise continua
  // rodando e sendo cobrada mesmo que ninguem mais esteja esperando o resultado,
  // e o retry automatico do app dispara uma SEGUNDA chamada paga em paralelo.
  var abortCtrl = new AbortController();
  req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });

  fetch(URL_MODELO_PRODUCAO, {
    method:"POST",
    signal: abortCtrl.signal,
    headers: headersModeloProducao(),
    body:JSON.stringify(corpoModeloProducao({ model:MODELO_PRODUCAO, max_tokens:3000, temperature:0, stream:true,
      stream_options:{ include_usage:true },
      messages:[
        {role:"system",content: buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA},
        {role:"user",content:[
        {type:"image_url",image_url:{url:"data:"+tipo+";base64,"+imagem}}
      ]}]
    }))
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
          if(ev.usage){
            usageCapturado.input_tokens=ev.usage.prompt_tokens||usageCapturado.input_tokens;
            usageCapturado.output_tokens=ev.usage.completion_tokens||usageCapturado.output_tokens;
          }
          if(ev.choices&&ev.choices[0]&&ev.choices[0].delta&&ev.choices[0].delta.content){
            texto+=ev.choices[0].delta.content;
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
      resultado=garantirAvisoFerrugem(resultado);resultado=corrigirFerrugemSemConfirmacao(resultado);resultado=focarNoPrincipal(resultado);
      resultado=anexarReferenciaVisual(resultado);
      res.write("data: "+JSON.stringify({ tipo:"fim", resultado })+"\n\n");
      logUsoAnalise(userId, "foto", MODELO_PRODUCAO_LOG, usageCapturado, regiao);
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
// ── TESTE COMPARATIVO: QWEN2.5-VL-72B via OpenRouter ──────────
// Endpoint SEPARADO, só para comparar qualidade/custo com a Sonnet.
// NÃO é chamado por nenhum fluxo do app — só para você testar manualmente
// (ex: via Postman, curl, ou uma tela de teste) com as mesmas fotos que já
// tem diagnóstico conhecido pela Sonnet. Nada aqui afeta usuários reais.
var OPENROUTER_KEY = process.env.OPENROUTER_KEY;

// ── INSTRUÇÃO EXTRA DE TESTE (v2 — inventário + revisão final) ──
// Isolada em variável própria, usada SOMENTE nos 3 endpoints de teste
// abaixo (Qwen, Gemini, GPT-5 Mini). Não afeta o prompt de produção
// da Sonnet (buildPromptStatic). Fácil de reverter: comente a linha
// que concatena INSTRUCAO_TESTE_EXTRA em cada endpoint, ou troque o
// conteúdo desta variável para testar outra versão da instrução.
var INSTRUCAO_TESTE_EXTRA = "\n\n### ETAPA OBRIGATÓRIA 1 — INVENTÁRIO DOS ACHADOS VISUAIS\n\nAntes de formular qualquer diagnóstico, faça uma inspeção completa e sistemática da imagem.\n\nPRIMEIRO, identifique QUAIS ELEMENTOS estão visíveis na foto: folhas? frutos/cerejas? ramos? Se a foto mostra MAIS DE UM tipo de elemento (por exemplo, frutos E folhas ao mesmo tempo), você DEVE inspecionar cada elemento SEPARADAMENTE — não pare a inspeção depois de encontrar um achado forte num elemento (ex: frutos mumificados) sem também verificar os outros elementos visíveis (ex: manchas na folha ao lado). Um achado óbvio numa parte da imagem NÃO dispensa a inspeção das outras partes.\n\nATENÇÃO ESPECÍFICA A FRUTOS: se a foto mostra um GRUPO/CACHO de frutos escuros, NÃO assuma que todos os frutos escuros da foto pertencem à mesma categoria só porque estão perto uns dos outros. Depois de identificar frutos mumificados (antracnose_fruto), verifique se existem TAMBÉM, na mesma foto, frutos escuros DIFERENTES desses — mais isolados, enrugados/foscos mas sem mumificação em grupo — que podem ser fruto_passado (problema de colheita atrasada, não doença) coexistindo com a antracnose. Compare a textura e o padrão de agrupamento de CADA fruto escuro individualmente antes de decidir se são todos a mesma coisa.\n\nListe mentalmente TODOS os achados visuais observados, incluindo:\n\n- manchas\n- halos\n- necroses\n- cloroses\n- deformações\n- perfurações\n- insetos\n- ovos\n- micélio\n- pústulas\n- alterações nas nervuras\n- alterações nas bordas\n- distribuição dos sintomas\n- intensidade\n- estágio aparente\n\nNão interrompa a inspeção ao encontrar o primeiro problema.\n\nSomente depois que TODOS os achados, em TODOS os elementos visíveis da foto, forem identificados, relacione esses achados aos diagnósticos possíveis.\n\n### ETAPA OBRIGATÓRIA 2 — REVISÃO FINAL\n\nAntes de responder:\n\nRevise toda a imagem uma segunda vez.\n\nPergunte:\n\n\"Existe algum sinal visível que ainda não foi explicado pelo diagnóstico principal?\", \"Se a foto tem frutos E folhas, eu relatei achados relevantes das duas partes, ou só de uma?\" e \"Dentro dos frutos escuros da foto, existem SUBGRUPOS com textura/padrão diferentes entre si que eu tratei como um só?\"\n\nSe existir algo não explicado, registre-o como diagnóstico diferencial de baixa ou média confiança.";

app.post("/teste-qwen-diagnostico", async function(req, res) {
  if (!OPENROUTER_KEY) return res.status(500).json({ erro:"OPENROUTER_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENROUTER_KEY
      },
      body: JSON.stringify({
        model: "qwen/qwen2.5-vl-72b-instruct",
        temperature: 0,
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na OpenRouter", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    // Custo aproximado (Qwen2.5-VL-72B via OpenRouter: ~$0.25/M input, ~$0.75/M output)
    var custoUsd = ((usage.prompt_tokens||0) * 0.25 + (usage.completion_tokens||0) * 0.75) / 1000000;

    res.json({
      modelo: "qwen2.5-vl-72b-instruct",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── EXEMPLOS FEW-SHOT PARA TESTE DO MISTRAL (calibração de confiança) ──
// Tres casos reais curados manualmente: um onde confianca 'alta' e
// justificada (traco decisivo nitidamente visivel), outro onde so
// confianca 'media' e correta (traco decisivo ausente, forma atipica,
// dois problemas coexistindo), e um de folha SAUDAVEL (nenhum achado) —
// adicionado apos observarmos que o modelo alucinava doenca em folha
// saudavel, ecoando o padrao de linguagem do exemplo de confianca alta.
// Isolado do buildPromptStatic — usado SOMENTE no teste do Mistral.
var FEWSHOT_EXEMPLO_ALTA_B64, FEWSHOT_EXEMPLO_MEDIA_B64, FEWSHOT_EXEMPLO_SAUDAVEL_B64;
try {
  FEWSHOT_EXEMPLO_ALTA_B64 = fs.readFileSync(path.join(__dirname, "fewshot", "exemplo-alta-confianca.b64.txt"), "utf8").trim();
  FEWSHOT_EXEMPLO_MEDIA_B64 = fs.readFileSync(path.join(__dirname, "fewshot", "exemplo-media-confianca.b64.txt"), "utf8").trim();
  FEWSHOT_EXEMPLO_SAUDAVEL_B64 = fs.readFileSync(path.join(__dirname, "fewshot", "exemplo-saudavel.b64.txt"), "utf8").trim();
} catch (e) {
  console.log("⚠️ Exemplos few-shot não encontrados em /fewshot — endpoint do Mistral vai rodar sem few-shot:", e.message);
}

var FEWSHOT_RESPOSTA_SAUDAVEL = JSON.stringify({
  diagnosticos: [
    {
      diagnostico: "saudavel",
      estagio: 0,
      confianca: "alta",
      visto: "Folhas com coloracao verde-escura uniforme e brilhante, limbo integro, sem manchas, halos, cloroses, necroses, deformacoes, perfuracoes, insetos, ovos, micelio, pustulas ou alteracoes nas nervuras ou bordas. Nenhum sinal visivel de doenca, praga ou deficiencia nutricional.",
      diagnostico_diferencial: "",
      acao: "Planta aparentemente saudavel. Continue o monitoramento periodico.",
      fungicidas: []
    }
  ]
});

var FEWSHOT_RESPOSTA_ALTA = JSON.stringify({
  diagnosticos: [
    {
      diagnostico: "cercosporiose",
      estagio: 4,
      confianca: "alta",
      visto: "Multiplas lesoes circulares na folha, com centro claro/esbranquicado nitidamente visivel e halo alaranjado bem definido ao redor de cada mancha; em algumas lesoes mais avancadas o tecido necrosado do centro caiu, deixando pequenos furos na folha. O centro claro caracteristico esta presente e nitido em varias lesoes, o que sustenta confianca alta.",
      diagnostico_diferencial: "",
      acao: "Aplique fungicida protetor cuprico (Oxicloreto de Cobre 840WP) em cobertura total da planta, e reforce com sistemico (Tebuconazol 200SC) dado o estagio avancado. Repita a cada 21 dias. Remova e destrua as folhas mais afetadas para reduzir fonte de inoculo.",
      fungicidas: [
        { nome:"Oxicloreto de Cobre 840WP", nome_comercial:"", tipo:"protetor", dose_min:2, dose_max:2.5, unidade:"kg", por:"hectare", proporcao_por_litro:2.5, unidade_proporcao:"g", intervalo_reaplicacao:21, carencia_dias:7 },
        { nome:"Tebuconazol 200SC", nome_comercial:"", tipo:"sistemico", dose_min:0.75, dose_max:1, unidade:"L", por:"hectare", proporcao_por_litro:0.75, unidade_proporcao:"mL", intervalo_reaplicacao:21, carencia_dias:7 }
      ]
    }
  ]
});

var FEWSHOT_RESPOSTA_MEDIA = JSON.stringify({
  diagnosticos: [
    {
      diagnostico: "cercosporiose",
      estagio: 2,
      confianca: "media",
      visto: "Mancha circular com halo amarelo amplo bem visivel; o centro da lesao esta escuro/arroxeado, sem o centro branco-acinzentado nitido do padrao classico — compativel com forma atipica mais avancada. Como o traco decisivo classico nao esta claramente visivel, a confianca nao pode ser alta mesmo com o restante do padrao compativel.",
      diagnostico_diferencial: "Observam-se tambem alguns pontinhos alaranjados dispersos pela folha, possivel indicio inicial de ferrugem — recomenda-se verificar a face inferior de outras folhas do talhao antes de tratar especificamente para isso. Corynespora foi considerada mas descartada por falta de aneis concentricos nitidos.",
      acao: "Aplique fungicida protetor cuprico (Oxicloreto de Cobre 840WP) em cobertura total, atingindo bem a face inferior das folhas. Repita a cada 21 dias enquanto houver periodo chuvoso. Monitore se o centro branco-acinzentado classico aparece em licoes mais novas.",
      fungicidas: [
        { nome:"Oxicloreto de Cobre 840WP", nome_comercial:"", tipo:"protetor", dose_min:2, dose_max:2.5, unidade:"kg", por:"hectare", proporcao_por_litro:2.5, unidade_proporcao:"g", intervalo_reaplicacao:21, carencia_dias:7 }
      ]
    },
    {
      diagnostico: "magnesio",
      estagio: 2,
      confianca: "media",
      visto: "Area internerval amarelada bem visivel na folha, com as nervuras mantendo coloracao mais verde — padrao compativel com clorose internerval de magnesio em folha velha.",
      diagnostico_diferencial: "",
      acao: "A correcao real desse nutriente e feita pelo solo, na calagem com calcario dolomitico — use a Calculadora de Calagem no modulo Analise de Solo do app pra saber a dose exata pro seu talhao.",
      fungicidas: []
    }
  ]
});


// ── TESTE COMPARATIVO: Mistral Small 4 (sucessor ativo do Pixtral Large,
// que foi descontinuado — "No endpoints found" no OpenRouter) ──
// Mesma estrutura do teste Qwen, só troca o modelo. Endpoint isolado,
// não afeta nenhum fluxo do app. Rota mantida como /teste-pixtral-diagnostico
// por simplicidade (era o nome original do teste).
app.post("/teste-pixtral-diagnostico", async function(req, res) {
  if (!OPENROUTER_KEY) return res.status(500).json({ erro:"OPENROUTER_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  // Monta as mensagens: se os exemplos few-shot carregaram, inclui 3 pares
  // exemplo-foto/resposta-correta ANTES da foto real, pra calibrar o
  // modelo por demonstracao (nao so por instrucao em texto).
  // ORDEM (v3): media -> alta -> saudavel (saudavel por ULTIMO agora).
  // Na v2 o exemplo de confianca alta (doenca clara) ficava por ultimo;
  // percebemos que o modelo passou a alucinar doenca em foto de folha
  // SAUDAVEL, ecoando a linguagem do exemplo mais recente na conversa
  // (efeito de recencia). Colocar o exemplo saudavel por ultimo e uma
  // correcao direcionada a essa falha especifica — mas e uma correcao
  // posicional, nao estrutural; o reforco de texto abaixo (nao inventar
  // achado ausente) e a parte mais robusta desta mudanca.
  var mensagens = [];
  if (FEWSHOT_EXEMPLO_ALTA_B64 && FEWSHOT_EXEMPLO_MEDIA_B64 && FEWSHOT_EXEMPLO_SAUDAVEL_B64) {
    mensagens.push({
      role: "user",
      content: [
        { type: "text", text: promptCompleto + "\n\nEXEMPLO DE REFERENCIA 1 — analise esta foto e retorne o JSON no formato pedido:" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + FEWSHOT_EXEMPLO_MEDIA_B64 } }
      ]
    });
    mensagens.push({ role: "assistant", content: FEWSHOT_RESPOSTA_MEDIA });
    mensagens.push({
      role: "user",
      content: [
        { type: "text", text: "EXEMPLO DE REFERENCIA 2 — mesma tarefa, outra foto:" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + FEWSHOT_EXEMPLO_ALTA_B64 } }
      ]
    });
    mensagens.push({ role: "assistant", content: FEWSHOT_RESPOSTA_ALTA });
    mensagens.push({
      role: "user",
      content: [
        { type: "text", text: "EXEMPLO DE REFERENCIA 3 — mesma tarefa, outra foto:" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + FEWSHOT_EXEMPLO_SAUDAVEL_B64 } }
      ]
    });
    mensagens.push({ role: "assistant", content: FEWSHOT_RESPOSTA_SAUDAVEL });
    mensagens.push({
      role: "user",
      content: [
        { type: "text", text: "Agora analise esta nova foto. IMPORTANTE: o numero de diagnosticos, o nivel de confianca e a presenca ou ausencia de problemas em cada exemplo acima foram determinados SOMENTE pelo que estava visivel EM CADA foto especifica — nao copie a estrutura de nenhum dos tres exemplos, e NAO assuma que esta foto nova tem algum problema so porque os exemplos anteriores tinham. Descreva PRIMEIRO, mentalmente, o que voce realmente ve nesta foto nova (cor, manchas, textura, uniformidade) antes de decidir o diagnostico. Se a folha nesta foto nova estiver com aparencia normal, saudavel, sem sinais visiveis de doenca/praga/deficiencia, retorne 'saudavel' mesmo que os exemplos anteriores tenham mostrado problemas. Se houver sinais de mais de um problema coexistindo, reporte todos eles, cada um com a confianca que o sinal especifico dele sustenta:" },
        { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
      ]
    });
  } else {
    mensagens.push({
      role: "user",
      content: [
        { type: "text", text: promptCompleto },
        { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
      ]
    });
  }

  try {
    var r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENROUTER_KEY
      },
      body: JSON.stringify({
        model: "mistralai/mistral-small-2603",
        temperature: 0,
        max_tokens: 3000,
        messages: mensagens
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na OpenRouter", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    // Custo aproximado (Mistral Small 4 via OpenRouter: $0.15/M input, $0.60/M output)
    var custoUsd = ((usage.prompt_tokens||0) * 0.15 + (usage.completion_tokens||0) * 0.60) / 1000000;

    res.json({
      modelo: "mistral-small-4-2603",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── TESTE COMPARATIVO: GEMINI 3.5 FLASH via Google AI Studio ──
// Mesma logica do teste da Qwen: endpoint SEPARADO e isolado, so para
// comparar qualidade/custo com a Sonnet. Nao afeta nenhum fluxo real do app.
var GEMINI_KEY = process.env.GEMINI_API_KEY;
app.post("/teste-gemini-diagnostico", async function(req, res) {
  if (!GEMINI_KEY) return res.status(500).json({ erro:"GEMINI_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptCompleto },
              { inline_data: { mime_type: tipo, data: imagem } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 3000 }
        })
      }
    );
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok || data.error) {
      return res.status(500).json({ erro: "Erro no Gemini", detalhes: data.error || data });
    }

    var textoResposta = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts.map(function(p){ return p.text||""; }).join("")
      : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usageMetadata || {};

    // Custo aproximado (Gemini 3.5 Flash: ~$1.50/M input, ~$9/M output)
    var inputTok = usage.promptTokenCount || 0;
    var outputTok = usage.candidatesTokenCount || 0;
    var custoUsd = (inputTok * 1.50 + outputTok * 9.00) / 1000000;

    res.json({
      modelo: "gemini-3.5-flash",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: { prompt_tokens: inputTok, completion_tokens: outputTok, total_tokens: usage.totalTokenCount||0 },
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── TESTE COMPARATIVO: GPT-5 MINI via OpenAI ───────────────────
// Mesma logica dos testes anteriores: endpoint SEPARADO e isolado, so
// para comparar qualidade/custo com a Sonnet. Nao afeta fluxo real do app.
var OPENAI_KEY = process.env.OPENAI_API_KEY;
// ── TESTE COMPARATIVO: Qwen-VL-Max (Alibaba direto, mesma infra da producao) ──
// Endpoint isolado, so para comparar no teste-comparacao.html. Preco NAO
// confirmado ainda (nao achei tabela oficial especifica pra esse modelo) —
// mostra os tokens reais e deixa custo_usd_estimado como null; confira o
// valor de verdade na aba de faturamento do console da Alibaba apos rodar.
app.post("/teste-qwen-vl-max-diagnostico", async function(req, res) {
  if (!process.env.DASHSCOPE_API_KEY) return res.status(500).json({ erro:"DASHSCOPE_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://ws-qmtud7hcd86gxmha.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.DASHSCOPE_API_KEY
      },
      body: JSON.stringify({
        model: "qwen-vl-max",
        temperature: 0,
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na Alibaba Cloud", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    // Preco confirmado na pagina de precos do Model Studio: US$0,80/M entrada, US$3,20/M saida
    var custoUsd = ((usage.prompt_tokens||0) * 0.80 + (usage.completion_tokens||0) * 3.20) / 1000000;

    res.json({
      modelo: "qwen-vl-max",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── TESTE COMPARATIVO: Qwen3.7-Plus (sucessor oficial do qwen-vl-max — ──
// este ultimo sera descontinuado em 10/10/2026, ver notice.aliyun.com/118344).
// Mesma infra direta da Alibaba, endpoint dedicado do workspace.
app.post("/teste-qwen37plus-diagnostico", async function(req, res) {
  if (!process.env.DASHSCOPE_API_KEY) return res.status(500).json({ erro:"DASHSCOPE_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://ws-qmtud7hcd86gxmha.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.DASHSCOPE_API_KEY
      },
      body: JSON.stringify({
        model: "qwen3.7-plus",
        temperature: 0,
        max_tokens: 3000,
        // Corrigido em 27/07/2026: esse endpoint estava sem enable_thinking,
        // por isso o Qwen3.7-Plus rodava com thinking ligado por padrao
        // (103.5s e 4366 tokens de raciocinio no teste). O outro endpoint
        // (qwen3vlflash) ja tinha essa flag; faltava replicar aqui.
        enable_thinking: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na Alibaba Cloud", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    var custoUsd = ((usage.prompt_tokens||0) * 0.40 + (usage.completion_tokens||0) * 1.60) / 1000000;

    res.json({
      modelo: "qwen3.7-plus",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── TESTE COMPARATIVO: Qwen3-VL-Flash (opcao mais rapida/barata da linha ──
// Qwen3-VL — candidato alternativo ao Qwen3.7-Plus, que demonstrou lentidao
// por gastar muitos tokens de "raciocinio interno" antes de responder.
app.post("/teste-qwen3vlflash-diagnostico", async function(req, res) {
  if (!process.env.DASHSCOPE_API_KEY) return res.status(500).json({ erro:"DASHSCOPE_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://ws-qmtud7hcd86gxmha.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.DASHSCOPE_API_KEY
      },
      body: JSON.stringify({
        model: "qwen3-vl-flash",
        temperature: 0,
        max_tokens: 3000,
        // qwen3-vl-flash e hibrido (pode "pensar" antes de responder); o
        // padrao dele e enable_thinking:false — mantemos explicito aqui
        // pra evitar o mesmo problema de lentidao/custo visto no qwen3.7-plus.
        enable_thinking: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na Alibaba Cloud", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    res.json({
      modelo: "qwen3-vl-flash",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: null,
      custo_brl_estimado: null,
      custo_nota: "Preco ainda nao confirmado na pagina oficial — confira no console da Alibaba Cloud."
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── TESTE COMPARATIVO: GLM-4.6V-Flash (Zhipu AI / Z.ai) ──────────
// Candidato chinês alternativo ao Qwen, sugerido apos avaliar o
// InternVL3-78B (descartado: contexto de so 16k tokens e hospedagem
// "deploy on demand" incompativel com nosso volume). GLM-4.6V-Flash
// tem 128K de contexto e e gratuito na API oficial da Z.ai (verificar
// se o custo $0 e permanente ou promocional antes de ir pra producao —
// modelos free tier costumam ter rate limit mais apertado).
// Endpoint isolado, mesma estrutura dos testes Qwen. Preco $0 confirmado
// na doc oficial em 27/07/2026 — reconfirme no dashboard antes de decidir.
app.post("/teste-glm46vflash-diagnostico", async function(req, res) {
  if (!process.env.ZAI_API_KEY) return res.status(500).json({ erro:"ZAI_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.ZAI_API_KEY
      },
      body: JSON.stringify({
        model: "glm-4.6v-flash",
        temperature: 0,
        // Aumentado de 3000 para 5000 em 27/07/2026: no teste anterior a
        // resposta bateu exatamente 3000/3000 tokens de saida, sinal de
        // truncamento no meio do JSON — o que pode ter distorcido o
        // diagnostico (deficiencia de magnesio, destoante dos outros 3
        // modelos que bateram em cercosporiose na mesma foto).
        max_tokens: 5000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok) {
      return res.status(500).json({ erro: "Erro na Z.ai", detalhes: data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    res.json({
      modelo: "glm-4.6v-flash",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: 0,
      custo_brl_estimado: 0,
      custo_nota: "Modelo Flash gratuito na API oficial Z.ai (confirmado 27/07/2026) — reconfirme no dashboard, pode ter rate limit."
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post("/teste-gpt5mini-diagnostico", async function(req, res) {
  if (!OPENAI_KEY) return res.status(500).json({ erro:"OPENAI_API_KEY não configurada no Railway." });
  var imagem = req.body.imagem;
  var tipo   = req.body.tipo || "image/jpeg";
  var regiao = req.body.regiao || null;
  var altitude = req.body.altitude || null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var promptCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA;
  var inicio = Date.now();

  try {
    var r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_KEY
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_completion_tokens: 5000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptCompleto },
              { type: "image_url", image_url: { url: "data:" + tipo + ";base64," + imagem } }
            ]
          }
        ]
      })
    });
    var data = await r.json();
    var duracaoMs = Date.now() - inicio;

    if (!r.ok || data.error) {
      return res.status(500).json({ erro: "Erro na OpenAI", detalhes: data.error || data });
    }

    var textoResposta = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    var resultado = extrairJSON(textoResposta);
    var usage = data.usage || {};

    // Custo aproximado (GPT-5 Mini: ~$0.25/M input, ~$2.00/M output)
    var custoUsd = ((usage.prompt_tokens||0) * 0.25 + (usage.completion_tokens||0) * 2.00) / 1000000;

    res.json({
      modelo: "gpt-5-mini",
      duracao_ms: duracaoMs,
      resultado_bruto: textoResposta,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: Math.round(custoUsd * 100000) / 100000,
      custo_brl_estimado: Math.round(custoUsd * 5.30 * 100) / 100
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

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
  var abortCtrl = new AbortController();
  req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });
  try {
    var r=await fetch(URL_MODELO_PRODUCAO,{
      method:"POST",
      signal: abortCtrl.signal,
      headers: headersModeloProducao(),
      body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:3000,temperature:0,
        messages:[
          {role:"system",content: buildPromptStatic(false) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA},
          {role:"user",content:[
            {type:"image_url",image_url:{url:"data:"+tipo+";base64,"+imagem}}
        ]}]}))
    });
    var d=await r.json();
    if(d.error) console.error("ERRO MODELO /diagnostico-json:", JSON.stringify(d.error));
    var txt=d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /diagnostico-json — texto recebido:", txt);
    if(!resultado||!resultado.diagnosticos||resultado.diagnosticos.length===0){
      resultado={diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente uma foto mais clara.",fungicidas:[]}]};
    }
    resultado=garantirAvisoFerrugem(resultado);resultado=corrigirFerrugemSemConfirmacao(resultado);resultado=focarNoPrincipal(resultado);
    resultado=anexarReferenciaVisual(resultado);
    logUsoAnalise(userId, "foto", MODELO_PRODUCAO_LOG, normalizarUsageOpenRouter(d.usage), regiao);
    res.json(resultado);
  } catch(e) { console.error("ERRO EXCECAO /diagnostico-json:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── GERAR DATASET DE TREINO (fine-tuning) — Sonnet como "professora" ──
// Roda a MESMA logica de producao (buildPromptStatic + Sonnet calibrada)
// numa foto, e devolve o par foto+resposta ja formatado como uma linha
// JSONL pronta pra fine-tuning (Mistral la Plateforme ou, mais pra frente,
// reformatada pro Qwen). NAO conta contra limite de analises do usuario —
// e uma ferramenta interna de geracao de dataset, nao um diagnostico real.
// IMPORTANTE: o schema do JSONL abaixo segue o formato mais comum
// (system/user/assistant, imagem em image_url) — confirme o schema EXATO
// na documentacao de fine-tuning da Mistral antes de subir o arquivo final,
// pode precisar de pequenos ajustes de campo.
app.post("/gerar-exemplo-treino", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg";
  var regiao=req.body.regiao||null, altitude=req.body.altitude||null;
  if (!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });

  var contextoRegional = buildContextoRegional(regiao, altitude, false);
  var systemCompleto = buildPromptStatic(false) + "\n\n" + contextoRegional;

  try {
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 3000, temperature: 0,
        system: [{ type:"text", text: systemCompleto }],
        messages: [{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type: tipo, data: imagem } }
        ]}]
      })
    });
    var d = await r.json();
    if (d.error) return res.status(500).json({ erro:"Erro na Anthropic", detalhes: d.error });

    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    if (!resultado) return res.status(500).json({ erro:"Não foi possível extrair JSON da resposta da Sonnet.", bruto: txt });
    resultado = garantirAvisoFerrugem(resultado);resultado = corrigirFerrugemSemConfirmacao(resultado);resultado = focarNoPrincipal(resultado);

    var linhaJsonl = {
      messages: [
        { role:"system", content: systemCompleto },
        { role:"user", content:[
          { type:"image_url", image_url:{ url: "data:" + tipo + ";base64," + imagem } }
        ]},
        { role:"assistant", content: JSON.stringify(resultado) }
      ]
    };

    res.json({
      resultado_sonnet: resultado,
      linha_jsonl_string: JSON.stringify(linhaJsonl),
      usage: d.usage || {}
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
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
"CORRELACOES NUTRICAO-DOENCA/PRAGA CONHECIDAS (fonte: SENAR, Colecao 189 — use APENAS estas relacoes verificadas quando o diagnostico bater com o padrao abaixo; NAO invente outras combinacoes):\n"+
"- Excesso de nitrogenio favorece phoma/ascochyta (tecido novo mais tenro e suscetivel).\n"+
"- Deficiencia de nitrogenio favorece cercosporiose e ferrugem.\n"+
"- Deficiencia de enxofre favorece bicho-mineiro.\n"+
"- Deficiencia de calcio e/ou boro favorece phoma/ascochyta, aureolada e antracnose (seca de ponteiros abre porta para esses fungos).\n"+
"- Deficiencias/desequilibrios nutricionais em geral (multiplos nutrientes baixos ao mesmo tempo) aumentam suscetibilidade a acaros e mancha-anular/leprose.\n"+
"Se o diagnostico recebido incluir ao mesmo tempo uma dessas deficiencias E a doenca/praga correspondente, mencione a relacao no campo nutricao ou resumo_geral (ex: 'A deficiencia de calcio observada favorece o avanco da phoma diagnosticada — corrigir o nutriente ajuda tambem no controle da doenca'). Fora desses pares especificos, NAO presuma relacao causal.\n\n"+
"REGRA OBRIGATORIA PARA CORRECAO DE CALCIO E MAGNESIO NO CAMPO 'nutricao' — PROIBIDO INVENTAR DOSE FOLIAR: quando o diagnostico incluir deficiencia de calcio ou magnesio, o campo 'nutricao' DEVE orientar a correcao pelo SOLO (calagem com calcario dolomitico) como solucao principal, e mencionar explicitamente: 'Use a Calculadora de Calagem no modulo Analise de Solo do app para calcular a dose exata de calcario pro seu talhao.' NUNCA cite um numero especifico de kg/hectare ou g/100L de aplicacao foliar ou de sulfato de magnesio para corrigir Ca ou Mg — essas doses variam por produto comercial e por resultado de laudo de solo, e um numero generico pode levar a sub ou super dosagem. Para os demais nutrientes, se mencionar aplicacao foliar como reforco, diga apenas para seguir a bula do produto comercial, sem inventar numero.\n\n"+
"SEJA DIRETO E CONCISO: cada campo deve ter no maximo 3-4 frases curtas ou bullets objetivos. Evite explicacoes longas, repeticao de justificativas, ou sub-listas extensas. Priorize as informacoes mais acionaveis.\n\n"+
"LINGUAGEM PARA PRODUTOR LEIGO — MUITO IMPORTANTE:\n"+
"1. Use APENAS o nome generico com a formulacao exata (ex: 'Oxicloreto de Cobre 840WP', 'Tebuconazol 200SC') EXATAMENTE como aparece na lista de produtos individuais fornecida. NUNCA invente, cite ou 'lembre' nomes comerciais/marcas de memoria — associar a marca errada ao ingrediente errado (ex: chamar Hidroxido de Cobre de 'Recop', que na verdade e Oxicloreto de Cobre) pode levar o produtor a comprar o produto incorreto. NUNCA troque a formulacao (WP/SC/EC) do que foi fornecido.\n"+
"2. Ao citar quantidade de nutriente em forma de oxido (K2O, P2O5, MgO, CaO), adicione uma explicacao curta na PRIMEIRA vez que aparecer no texto, tipo: '(confira essa % no rotulo do adubo que voce comprar)'. Nao repita a explicacao se o mesmo oxido aparecer de novo no mesmo campo.\n"+
"3. Evite jargao sem contexto. Se usar termos como 'calda', 'fertirrigacao', 'pos-emergencia', 'carencia', adicione uma explicacao de 3-6 palavras entre parenteses na primeira mencao (ex: 'fertirrigacao (adubo dissolvido na agua de irrigacao)').\n"+
"4. Prefira frases curtas e diretas a paragrafos corridos. Numere passos quando houver sequencia de acoes.\n\n"+
"FORMATO JSON:\n"+
"{\"resumo_geral\":\"...\",\"urgente\":\"...\",\"em_21_dias\":\"...\",\"nutricao\":\"...\",\"resumo\":\"frase curta\"}";

  var promptUsuario = regiaoCtx+"\n\nDiagnostico encontrou:\n"+resumoDiags;

  var abortCtrl = new AbortController();
  req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });
  try {
    var r=await fetch(URL_MODELO_PRODUCAO,{
      method:"POST",
      signal: abortCtrl.signal,
      headers: headersModeloProducao(),
      body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:2000,temperature:0,
        messages:[
          {role:"system",content:sistemaStatic},
          {role:"user",content:promptUsuario}
        ]}))
    });
    var d=await r.json();
    if(d.error){
      console.error("ERRO MODELO /plano-acao:", JSON.stringify(d.error));
      return res.status(502).json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"", erro:"Servico de IA indisponivel no momento. Tente novamente em instantes." });
    }
    var txt=d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:"";
    var resultado=extrairJSON(txt);
    if(!resultado){
      console.error("ERRO PARSE /plano-acao — texto recebido:", txt);
    }
    logUsoAnalise(userId, "plano-acao", MODELO_PRODUCAO_LOG, normalizarUsageOpenRouter(d.usage), regiao);
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
  frames.forEach(function(frame,i){ content.push({type:"text",text:"Frame "+(i+1)+":"}); content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+frame}}); });
  var abortCtrl = new AbortController();
  req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });
  try {
    var r=await fetch(URL_MODELO_PRODUCAO,{
      method:"POST",
      signal: abortCtrl.signal,
      headers: headersModeloProducao(),
      body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:3000,temperature:0,
        messages:[
          {role:"system",content: buildPromptStatic(true) + "\n\n" + contextoRegional + INSTRUCAO_TESTE_EXTRA},
          {role:"user",content:content}
        ]}))
    });
    var d=await r.json();
    if(d.error) console.error("ERRO MODELO /diagnostico-video:", JSON.stringify(d.error));
    var txt=d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /diagnostico-video — texto recebido:", txt);
    resultado=garantirAvisoFerrugem(resultado);resultado=corrigirFerrugemSemConfirmacao(resultado);resultado=focarNoPrincipal(resultado);
    resultado=anexarReferenciaVisual(resultado);
    logUsoAnalise(userId, "video", MODELO_PRODUCAO_LOG, normalizarUsageOpenRouter(d.usage), regiao);
    res.json(resultado||{diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente novamente.",fungicidas:[]}]});
  } catch(e) { console.error("ERRO EXCECAO /diagnostico-video:", e.message); res.status(500).json({ erro:e.message }); }
});

// ── CALCULADORA DE CALAGEM E GESSAGEM (5ª Aproximação CFSEMG/1999) ──────
// Norma ainda vigente em MG (nao ha 6a Aproximacao publicada ate 2026).
// Metodo padrao: Saturacao de Bases (mais usado na pratica, considera a
// CTC do solo). Fallback: metodo Aluminio Trocavel + Ca+Mg, usado quando o
// laudo nao traz T (CTC a pH 7,0). Calculo 100% determinístico — a IA so
// extrai os numeros brutos do laudo (campo valores_calculo), nunca calcula.
var PRNT_PADRAO = 80; // PRNT medio de calcario comercial — ajustavel

function calcularCalagemGessagem(vc) {
  if (!vc) return null;
  var ca = parseFloat(vc.ca_cmolc), mg = parseFloat(vc.mg_cmolc), k = parseFloat(vc.k_cmolc);
  var al = parseFloat(vc.al_cmolc), t = parseFloat(vc.t_cmolc), tEf = parseFloat(vc.ctc_efetiva_cmolc);
  var argila = parseFloat(vc.argila_pct);
  var metodo = null, nc = null;

  if (!isNaN(t) && t > 0) {
    // Metodo de Saturacao de Bases: NC = (Ve/100)*T - SB
    var sb = (isNaN(ca)?0:ca) + (isNaN(mg)?0:mg) + (isNaN(k)?0:k);
    var Ve = 60; // saturacao de bases pretendida para cafeeiro (5a Aproximacao)
    nc = (Ve/100)*t - sb;
    metodo = "saturacao_bases";
  } else if (!isNaN(al) && (!isNaN(ca) || !isNaN(mg))) {
    // Metodo Aluminio Trocavel + Ca+Mg: NC = Y*Al + [X-(Ca+Mg)]
    var Y = 2; // textura media, default
    if (!isNaN(argila)) {
      if (argila < 15) Y = 1; else if (argila <= 35) Y = 2;
      else if (argila <= 60) Y = 3; else Y = 4;
    }
    var X = 3; // cafeeiro (alta exigencia em Ca)
    var caMg = (isNaN(ca)?0:ca) + (isNaN(mg)?0:mg);
    var parteAl = Y * al, parteCaMg = X - caMg;
    nc = (parteAl > 0 ? parteAl : 0) + (parteCaMg > 0 ? parteCaMg : 0);
    metodo = "aluminio_ca_mg";
  }

  if (nc === null || isNaN(nc) || nc <= 0) return null;

  var qc = nc * (100 / PRNT_PADRAO);
  var resultado = {
    metodo: metodo,
    necessidade_calcario_t_ha: Math.round(nc * 100) / 100,
    dose_recomendada_t_ha: Math.round(qc * 100) / 100,
    prnt_considerado: PRNT_PADRAO,
    observacao: "Calculo pela 5a Aproximacao (CFSEMG/1999), norma ainda vigente em MG. Dose ajustada para PRNT ~" + PRNT_PADRAO + "%; confira o PRNT real no saco do calcario e ajuste: dose_final = dose_calculada x (100/PRNT_real)."
  };

  // Gessagem: indicada se saturacao por Al no subsolo (m%) >= 30% ou Ca baixo
  var mPct = null;
  if (!isNaN(al) && !isNaN(tEf) && tEf > 0) mPct = (al / tEf) * 100;
  var precisaGesso = (mPct !== null && mPct >= 30) || (!isNaN(ca) && ca <= 0.4);
  if (precisaGesso) {
    var ng = nc * 0.25; // 25% da NC, para correcao na camada de 20-40cm
    if (ng > 0) {
      resultado.gessagem = {
        necessario: true,
        dose_recomendada_t_ha: Math.round(ng * 100) / 100,
        motivo: mPct !== null ? ("saturacao por aluminio no subsolo estimada em " + Math.round(mPct) + "%") : "calcio baixo",
        observacao: "Gesso nao substitui o calcario — aplique os dois. O gesso age no subsolo (20-40cm) e o calcario na camada superficial."
      };
    }
  }
  return resultado;
}

// ── CALCULADORA DE ADUBAÇÃO NPK (5ª Aproximação CFSEMG/1999) ────────────
// Tabelas 14 e 15 do "Manual do Café - Manejo de Cafezais em Produção"
// (EMATER-MG/2016), que reproduzem a norma oficial. Depende da produtividade
// ESPERADA (sc/ha) informada pelo produtor — dado que nao vem do laudo.
// N: tabela por faixa de produtividade (coluna "sem analise foliar", pois o
// app ainda nao coleta analise foliar). P2O5: tabela por produtividade x
// classe de fertilidade de P (que depende do teor de argila). K2O: tabela
// por produtividade x classe de fertilidade de K (direto em mg/dm3, sem
// depender de argila).
var TABELA_N = [
  { max:20, dose:200 }, { max:30, dose:250 }, { max:40, dose:300 },
  { max:50, dose:350 }, { max:60, dose:400 }, { max:Infinity, dose:450 }
];
var TABELA_P2O5 = [ // [muito_baixo, baixo, medio, bom, muito_bom]
  { max:20,  doses:[30,20,10,0,0] }, { max:30,  doses:[40,30,20,0,0] },
  { max:40,  doses:[50,40,25,0,0] }, { max:50,  doses:[60,50,30,15,0] },
  { max:60,  doses:[70,55,35,18,0] }, { max:Infinity, doses:[80,60,40,20,0] }
];
var TABELA_K2O = [ // [baixo(<60), medio(60-120), bom(120-200), muito_bom(>200)]
  { max:20,  doses:[200,150,100,0] }, { max:30,  doses:[250,190,125,0] },
  { max:40,  doses:[300,225,150,0] }, { max:50,  doses:[350,260,175,50] },
  { max:60,  doses:[400,300,200,75] }, { max:Infinity, doses:[450,340,225,100] }
];
// Faixas de argila (%) -> limites de P (mg/dm3) para cada classe [muito_baixo,baixo,medio,bom]
// acima do limite "bom" já é muito_bom (índice 4)
var FAIXAS_P_POR_ARGILA = [
  { max:15,  limites:[7.5, 15.0, 22.5, 33.8] },
  { max:35,  limites:[5.0, 9.0, 15.0, 22.5] },
  { max:60,  limites:[3.0, 6.0, 9.0, 13.5] },
  { max:101, limites:[1.9, 4.0, 6.0, 9.0] }
];

function classificarPorFaixa(valor, faixas) {
  for (var i=0;i<faixas.length;i++) if (valor <= faixas[i]) return i;
  return faixas.length; // acima da última faixa = muito_bom
}
function buscarDoseTabela(tabela, produtividadeSc, indiceClasse) {
  for (var i=0;i<tabela.length;i++) {
    if (produtividadeSc <= tabela[i].max) {
      var linha = tabela[i];
      return linha.doses ? linha.doses[indiceClasse] : linha.dose;
    }
  }
  return null;
}

function calcularAdubacaoNPK(produtividadeSc, pMgDm3, kMgDm3, argilaPct) {
  if (produtividadeSc === null || produtividadeSc === undefined || isNaN(produtividadeSc) || produtividadeSc <= 0) return null;

  var doseN = buscarDoseTabela(TABELA_N, produtividadeSc, null);

  var doseK2O = null;
  if (!isNaN(kMgDm3)) {
    var classeK = kMgDm3 < 60 ? 0 : (kMgDm3 <= 120 ? 1 : (kMgDm3 <= 200 ? 2 : 3));
    doseK2O = buscarDoseTabela(TABELA_K2O, produtividadeSc, classeK);
  }

  var doseP2O5 = null;
  if (!isNaN(pMgDm3)) {
    var argila = isNaN(argilaPct) ? 30 : argilaPct; // default textura media se nao informado
    var faixaArgila = FAIXAS_P_POR_ARGILA[0];
    for (var j=0;j<FAIXAS_P_POR_ARGILA.length;j++) { if (argila <= FAIXAS_P_POR_ARGILA[j].max) { faixaArgila = FAIXAS_P_POR_ARGILA[j]; break; } }
    var classeP = classificarPorFaixa(pMgDm3, faixaArgila.limites);
    doseP2O5 = buscarDoseTabela(TABELA_P2O5, produtividadeSc, classeP);
  }

  if (doseN === null && doseP2O5 === null && doseK2O === null) return null;

  return {
    produtividade_esperada_sc_ha: produtividadeSc,
    nitrogenio_kg_ha_ano: doseN,
    fosforo_p2o5_kg_ha_ano: doseP2O5,
    potassio_k2o_kg_ha_ano: doseK2O,
    observacao: "Doses anuais totais (5a Aproximacao, CFSEMG/1999). Parcele em 3-4 aplicacoes de N e K2O ao longo do periodo chuvoso, sob a saia do cafeeiro. O fosforo (P2O5) pode ser aplicado de uma so vez, de forma localizada. Sem analise foliar, o N considera a tabela padrao — se tiver analise foliar recente, um agronomo pode ajustar a dose para cima ou para baixo."
  };
}


// ── TESTE COMPARATIVO: Analise de Solo na Sonnet ─────────────────
// Criado em 28/07/2026 apos descobrirmos que /analise-solo ja estava
// rodando em Qwen (efeito colateral da troca global de MODELO_PRODUCAO,
// nao uma decisao deliberada testada). Como solo envolve LEITURA DE
// NUMEROS de um laudo (nao reconhecimento de padrao visual solto), um
// erro aqui tem consequencia pratica diferente — dose errada de calcario/
// adubo — por isso testamos contra a Sonnet como gabarito antes de
// confiar no Qwen pra esse endpoint especifico. Mesmo prompt exato do
// /analise-solo de producao, so muda o modelo/endpoint de destino.
app.post("/teste-solo-sonnet", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  if(!imagem) return res.status(400).json({ erro:"Envie a imagem em base64 no campo 'imagem'." });
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper, Embrapa e na 5a Aproximacao (CFSEMG/1999, norma oficial de MG ainda vigente).\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nSe o laudo tiver MAIS DE UMA amostra/talhao, NAO detalhe cada amostra separadamente: consolide tudo em UMA UNICA recomendacao objetiva (use a media ou a amostra mais critica como referencia) e preencha os \"valores\" com a amostra mais representativa ou a media simples entre elas. O campo \"acao\" deve ter no maximo 4 frases curtas, direto ao ponto.\n\nREGRA OBRIGATORIA DE FORMATO NUMERICO: todo campo em \"valores\" e em \"valores_calculo\" DEVE conter UM UNICO NUMERO (ou string curta tipo \"6,1\"), NUNCA uma lista de valores separados por barra (ex: \"4,1 / 4,4 / 5,5\" esta ERRADO) e NUNCA um intervalo (ex: \"4,1-5,5\" esta ERRADO). Se houver multiplas amostras, voce mesmo faz a consolidacao ANTES de preencher o JSON — escolhe a media ou a amostra mais critica e coloca APENAS esse numero final. Isso e obrigatorio porque esses valores alimentam uma calculadora automatica que espera numeros unicos, nao listas.\n\nREGRA OBRIGATORIA PARA VALOR NAO ANALISADO: se um nutriente (como B ou Zn) NAO aparece no laudo, preencha \"valor\":\"nao analisado\" e \"status\":\"baixo\" SEMPRE — nunca use status \"alto\" ou \"ok\" quando o valor e nulo/nao analisado, porque isso afirmaria uma informacao que voce nao tem. Ausencia de dado no laudo nunca pode virar alegacao de excesso (\"alto\"); a postura correta e conservadora, sinalizando que precisa ser testado.\n\nCAMPO valores_calculo — MUITO IMPORTANTE: preencha com os valores BRUTOS em cmolc/dm3 (ou meq/100cm3, equivalente) EXATAMENTE como aparecem no laudo, para Ca, Mg, K, Al trocavel, CTC efetiva (t) e CTC a pH 7,0 (T), alem do teor de argila em % se informado. Copie os numeros exatos, sem converter unidade, sem arredondar, sem estimar (mas sempre consolidados em UM UNICO numero por campo, conforme regra acima). Se o laudo NAO trouxer algum desses valores explicitamente, deixe o campo correspondente como null — NUNCA invente ou estime um numero que nao esta no laudo.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples, maximo 4 frases\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}},\"valores_calculo\":{\"ca_cmolc\":null,\"mg_cmolc\":null,\"k_cmolc\":null,\"al_cmolc\":null,\"t_cmolc\":null,\"ctc_efetiva_cmolc\":null,\"argila_pct\":null}}";
  var inicio = Date.now();
  try {
    var r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 2000, temperature: 0,
        system: [{ type:"text", text: sistemaStatic + "\n\n" + (contexto||"Sem contexto regional adicional.") }],
        messages: [{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type: tipo, data: imagem } }
        ]}]
      })
    });
    var d = await r.json();
    var duracaoMs = Date.now() - inicio;
    if (d.error) return res.status(500).json({ erro:"Erro na Anthropic", detalhes: d.error });
    var txt = d.content && d.content[0] ? d.content[0].text : "";
    var resultado = extrairJSON(txt);
    if(resultado && resultado.valores_calculo){
      try {
        var calagem = calcularCalagemGessagem(resultado.valores_calculo);
        if(calagem) resultado.calagem_gessagem = calagem;
      } catch(eCalc) {}
    }
    var usage = d.usage||{};
    var custoUsd = usage.input_tokens ? ((usage.input_tokens/1000000)*3.00 + (usage.output_tokens/1000000)*15.00) : null;
    res.json({
      modelo: "claude-sonnet-4-6",
      duracao_ms: duracaoMs,
      resultado_bruto: txt,
      resultado_parseado: resultado,
      usage: usage,
      custo_usd_estimado: custoUsd,
      custo_brl_estimado: custoUsd ? custoUsd*5.20 : null
    });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

app.post("/analise-solo", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  var produtividadeSc = req.body.produtividadeSc!==undefined && req.body.produtividadeSc!==null && req.body.produtividadeSc!=="" ? parseFloat(req.body.produtividadeSc) : null;
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var uLim = await dbGetUser(userId);
    if (uLim && analisesRestantes(uLim) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaStatic="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper, Embrapa e na 5a Aproximacao (CFSEMG/1999, norma oficial de MG ainda vigente).\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nSe o laudo tiver MAIS DE UMA amostra/talhao, NAO detalhe cada amostra separadamente: consolide tudo em UMA UNICA recomendacao objetiva (use a media ou a amostra mais critica como referencia) e preencha os \"valores\" com a amostra mais representativa ou a media simples entre elas. O campo \"acao\" deve ter no maximo 4 frases curtas, direto ao ponto.\n\nREGRA OBRIGATORIA DE FORMATO NUMERICO: todo campo em \"valores\" e em \"valores_calculo\" DEVE conter UM UNICO NUMERO (ou string curta tipo \"6,1\"), NUNCA uma lista de valores separados por barra (ex: \"4,1 / 4,4 / 5,5\" esta ERRADO) e NUNCA um intervalo (ex: \"4,1-5,5\" esta ERRADO). Se houver multiplas amostras, voce mesmo faz a consolidacao ANTES de preencher o JSON — escolhe a media ou a amostra mais critica e coloca APENAS esse numero final. Isso e obrigatorio porque esses valores alimentam uma calculadora automatica que espera numeros unicos, nao listas.\n\nREGRA OBRIGATORIA PARA VALOR NAO ANALISADO: se um nutriente (como B ou Zn) NAO aparece no laudo, preencha \"valor\":\"nao analisado\" e \"status\":\"baixo\" SEMPRE — nunca use status \"alto\" ou \"ok\" quando o valor e nulo/nao analisado, porque isso afirmaria uma informacao que voce nao tem. Ausencia de dado no laudo nunca pode virar alegacao de excesso (\"alto\"); a postura correta e conservadora, sinalizando que precisa ser testado.\n\nCAMPO valores_calculo — MUITO IMPORTANTE: preencha com os valores BRUTOS em cmolc/dm3 (ou meq/100cm3, equivalente) EXATAMENTE como aparecem no laudo, para Ca, Mg, K, Al trocavel, CTC efetiva (t) e CTC a pH 7,0 (T), alem do teor de argila em % se informado. Copie os numeros exatos, sem converter unidade, sem arredondar, sem estimar (mas sempre consolidados em UM UNICO numero por campo, conforme regra acima). Se o laudo NAO trouxer algum desses valores explicitamente, deixe o campo correspondente como null — NUNCA invente ou estime um numero que nao esta no laudo.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples, maximo 4 frases\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}},\"valores_calculo\":{\"ca_cmolc\":null,\"mg_cmolc\":null,\"k_cmolc\":null,\"al_cmolc\":null,\"t_cmolc\":null,\"ctc_efetiva_cmolc\":null,\"argila_pct\":null}}";
  try {
    var abortCtrl = new AbortController();
    req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });
    var r=await fetch(URL_MODELO_PRODUCAO,{
      method:"POST",
      signal: abortCtrl.signal,
      headers: headersModeloProducao(),
      body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:2000,temperature:0,
        messages:[
          {role:"system",content: sistemaStatic + "\n\n" + (contexto||"Sem contexto regional adicional.")},
          {role:"user",content:[{type:"image_url",image_url:{url:"data:"+tipo+";base64,"+imagem}}]}
        ]}))
    });
    var d=await r.json();
    if(d.error) console.error("ERRO MODELO /analise-solo:", JSON.stringify(d.error));
    var txt=d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:"";
    var resultado=extrairJSON(txt);
    if(!resultado&&!d.error) console.error("ERRO PARSE /analise-solo — texto recebido:", txt);
    if(resultado && resultado.valores_calculo){
      try {
        var calagem = calcularCalagemGessagem(resultado.valores_calculo);
        if(calagem) resultado.calagem_gessagem = calagem;
      } catch(eCalc) { console.error("ERRO calcularCalagemGessagem:", eCalc.message); }
    }
    if(resultado && produtividadeSc){
      try {
        var pNum = resultado.valores && resultado.valores.P && resultado.valores.P.valor ? parseFloat(String(resultado.valores.P.valor).replace(",",".")) : NaN;
        var kNum = resultado.valores && resultado.valores.K && resultado.valores.K.valor ? parseFloat(String(resultado.valores.K.valor).replace(",",".")) : NaN;
        var argilaNum = resultado.valores_calculo ? parseFloat(resultado.valores_calculo.argila_pct) : NaN;
        var npk = calcularAdubacaoNPK(produtividadeSc, pNum, kNum, argilaNum);
        if(npk) resultado.adubacao_npk = npk;
      } catch(eNpk) { console.error("ERRO calcularAdubacaoNPK:", eNpk.message); }
    }
    logUsoAnalise(userId, "solo", MODELO_PRODUCAO_LOG, normalizarUsageOpenRouter(d.usage), regiao);
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

  var abortCtrl = new AbortController();
  req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });

  fetch(URL_MODELO_PRODUCAO,{
    method:"POST",
    signal: abortCtrl.signal,
    headers: headersModeloProducao(),
    body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:2200,temperature:0,stream:true,
      stream_options:{ include_usage:true },
      messages:[
        {role:"system",content: sistemaStatic + "\n\n" + (contexto||"Sem contexto regional adicional.")},
        {role:"user",content:[{type:"image_url",image_url:{url:"data:"+tipo+";base64,"+imagem}}]}
      ]}))
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
          if(ev.usage){
            usageCapturado.input_tokens=ev.usage.prompt_tokens||usageCapturado.input_tokens;
            usageCapturado.output_tokens=ev.usage.completion_tokens||usageCapturado.output_tokens;
          }
          if(ev.choices&&ev.choices[0]&&ev.choices[0].delta&&ev.choices[0].delta.content){
            texto+=ev.choices[0].delta.content;
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
      logUsoAnalise(userId, "daninha", MODELO_PRODUCAO_LOG, usageCapturado, regiao);
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

// ── TRIAGEM DE DEFEITOS DO GRÃO SECO ─── Sonnet | max_tokens:1800 ──────
// Catalogo baseado em fontes tecnicas oficiais: Instrucao Normativa MAPA
// no 8/2003 (Classificacao Oficial Brasileira), Rehagro e EMATER-MG.
// REGRA DE OURO: NUNCA classificar bebida (mole/dura/riada/rio — exige
// torra + prova sensorial por classificador certificado), NUNCA estimar
// umidade (exige medidor fisico), NUNCA dar tipo/classificacao oficial
// COB (exige amostra padronizada de 300g, nao uma foto de punhado na mao).
// So aponta defeitos VISIVEIS na foto + causa provavel + acao pratica.
app.post("/identifica-defeito-grao", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var userId=req.body.userId||"anonimo";
  if(!checkRateLimit(userId)) return res.status(429).json({ erro:"Muitas análises. Aguarde 1 minuto." });
  if (userId !== "anonimo") {
    var uLimG = await dbGetUser(userId);
    if (uLimG && analisesRestantes(uLimG) <= 0) {
      return res.status(403).json({ erro:"Limite de analises atingido.", semAnalises:true });
    }
  }
  var contextoG=regiao?" O produtor esta na regiao "+regiao+".":"";
  var sistemaGraos=
"Voce e o Doutor Cafe, especialista em pos-colheita e classificacao fisica de cafe, com base na Instrucao Normativa MAPA no 8/2003 (Classificacao Oficial Brasileira - COB) e nos manuais tecnicos EMATER-MG e Rehagro.\n\n"+
"Analise esta foto de uma AMOSTRA DE CAFE JA SECO E BENEFICIADO (grao cru, sem casca) e identifique os DEFEITOS VISIVEIS.\n\n"+
"CATALOGO DE DEFEITOS INTRINSECOS (do grao):\n"+
"preto=coloracao PRETA OPACA uniforme no grao inteiro. Causa: fruto ficou tempo demais na planta, ou grao caiu e ficou em contato com o solo (apodrecimento). E o PIOR defeito (maior peso na classificacao).\n"+
"ardido=coloracao MARROM em tons variados (nao preto opaco, nao verde). Causa: fermentacao por microrganismo — pode ocorrer na lavoura (fruto caido) ou na secagem (terreiro sem revolvimento, ou grao preso em fenda/buraco do terreiro).\n"+
"preto_verde=grao PRETO mas BRILHANTE (a pelicula prateada ainda fica aderida e da esse brilho). Causa: grao verde que passou por secagem MUITO INTENSA/alta temperatura. Deve ser tratado como categoria ardido na gravidade.\n"+
"verde=coloracao VERDE em tons diversos, pelicula prateada aderida, sulco ventral fechado. Causa: colheita prematura (fruto ainda imaturo).\n"+
"chocho_mal_granado=grao ACHATADO/MURCHO, MUITO MAIS LEVE e menor que os outros da amostra, superficie enrugada, formacao incompleta. Causa provavel: deficiencia nutricional (ESPECIALMENTE POTASSIO), estresse hidrico (falta de agua na fase de granacao), ou fator genetico/cultivar nao adaptada ao clima local. IMPORTANTE: se aparecer MUITO grao chocho na amostra, mencione no campo 'acao' que vale investigar adubacao potassica e irrigacao na lavoura — conecta com o modulo de diagnostico de folha do app.\n"+
"brocado=um ou mais ORIFICIOS (furos) pequenos e redondos no grao, causados pela broca-do-café ainda na lavoura. Subtipos por gravidade: brocado_limpo (ate 3 furos, sem parte preta ao redor), brocado_rendado (3+ furos, sem parte preta), brocado_sujo (furos COM parte preta/azulada ao redor — o mais grave dos tres). Causa: infestacao de broca-do-cafe (Hypothenemus hampei) na lavoura.\n"+
"concha_miolo_concha=grao com FORMATO CONCAVO/CONCHA, fino, resultado da separacao de dois graos que cresceram colados (grao cabeca). Nao e causado por manejo ruim, e uma anomalia natural da fecundacao do fruto.\n"+
"quebrado_esmagado=grao PARTIDO ou ACHATADO/AMASSADO (nao inteiro). Quebrado (partido em pedacos) e mais comum com grao de BAIXA UMIDADE (abaixo de 10%, fica quebradico por seca excessiva) no beneficiamento, alem de descascador mal regulado. Esmagado (achatado, deformado) e causado por descascador mal regulado E/OU por tracao animal ou mecanizada pisoteando o cafe durante a secagem no terreiro (nao e um indicador confiavel de umidade alta).\n"+
"melado_peliculado=grao com formato PERFEITO mas com a peliculazinha (espermoderma) ainda aderida, coloracao marrom LIGEIRAMENTE AVERMELHADA (nao e defeito grave, e mais um efeito climatico na secagem).\n"+
"palido=coloracao AMARELADA que destoa visivelmente do resto da amostra (grãos ao redor são mais esverdeados/acinzentados).\n"+
"fungo=MOFO ou ESPOROS visiveis a olho nu na superficie do grao — manchas ESBRANQUICADAS ou ACINZENTADAS, com aspecto PELUDO/pulverulento (pó fino), diferente da textura lisa do grao normal. Diferente de ardido/preto (que sao sobre COR por fermentacao): aqui o que importa e a TEXTURA de mofo visivel, nao a cor. Causa provavel: armazenamento em local umido, secagem incompleta (umidade acima do ideal antes de guardar) ou ventilacao inadequada no deposito. ATENCAO — DEFEITO DE SEGURANCA ALIMENTAR: mofo em grao de cafe pode indicar presenca de micotoxinas (ex: ocratoxina A), prejudiciais a saude. No campo 'acao' para este item, SEMPRE recomende descartar os graos afetados e NAO misturar com o restante do lote, alem de revisar o processo de secagem (atingir 11-12% de umidade) e armazenamento (local seco, ventilado, longe do chao).\n\n"+
"CATALOGO DE DEFEITOS EXTRINSECOS (impurezas, nao sao graos de cafe ou sao grao com parte da casca/pergaminho ainda grudada):\n"+
"coco=grao que AINDA TEM A CASCA (exocarpo) NAO RETIRADA no beneficiamento — parece um fruto seco inteiro, nao um grao limpo. Causa provavel: regulagem inadequada da maquina beneficiadora (descascador).\n"+
"marinheiro=grao com o PERGAMINHO (a pelicula interna, cor palha/bege clara) parcialmente ou totalmente NAO retirado, ainda GRUDADO/cobrindo parte do proprio grao. Causa provavel: regulagem inadequada da maquina beneficiadora (descascador/brunidora).\n"+
"pergaminho=FRAGMENTO SOLTO do pergaminho (a casca interna que envolve a semente, cor palha/bege clara, textura de papel fino) misturado na amostra, SEM estar grudado a nenhum grao — diferente de marinheiro, que e o grao com pergaminho ainda aderido a ele. Causa provavel: regulagem inadequada da maquina beneficiadora (descascador/brunidora).\n"+
"casca=fragmento solto da casca seca do fruto, de tamanhos variados, misturado na amostra (nao esta grudado em nenhum grao). Causa provavel: ventiladores/catacao mal regulados no beneficiamento, alem de regulagem inadequada do descascador.\n"+
"pau_pedra_torrao=impurezas fisicas estranhas ao cafe (graveto, pedra, torrao de terra) misturadas na amostra. Causa provavel PRINCIPAL: colheita por derriça no chao, abanacao mal feita, cafe nao lavado antes da secagem, ou secagem em terreiro sujo/deteriorado que solta pedras e torroes. Causa secundaria: regulagem do catador/ventilador no beneficiamento nao eliminou o que veio do terreiro.\n\n"+
"REGRAS OBRIGATORIAS:\n"+
"1. NUNCA mencione ou tente classificar 'bebida' (mole, dura, riada, rio, etc.) — isso exige torrar e degustar uma amostra por um classificador certificado, e impossivel avaliar por foto. Se o usuario perguntar sobre isso na duvida, explique isso no campo 'acao' de forma educada.\n"+
"2. NUNCA estime umidade (%) — exige medidor fisico (higrometro).\n"+
"3. NUNCA de uma classificacao oficial de 'Tipo' (Tipo 2 a Tipo 8 da COB) — isso exige amostra padronizada de 300g contada grao a grao, uma foto de um punhado na mao NAO e amostra valida para isso. Pode mencionar a gravidade relativa (ex: 'preto e ardido sao os defeitos mais graves') sem cravar um Tipo numerico.\n"+
"4. So use confianca 'alta' se o defeito estiver CLARAMENTE visivel e sem ambiguidade com outro defeito parecido (ex: preto vs ardido escuro pode ser ambiguo — nesse caso use 'media').\n"+
"5. Se a amostra parecer limpa/sem defeitos visiveis, retorne 'defeitos':[] — nao invente defeito so para preencher.\n"+
"6. Para CADA defeito encontrado, o campo 'acao' deve ser uma orientacao PRATICA de manejo (ex: revisar ponto de colheita, regular descascador, investigar broca na lavoura, considerar adubacao potassica) — NUNCA um conselho de venda/precificacao.\n"+
"7. FOTO DE AMOSTRA AMONTOADA (punhado na mao, grãos sobrepostos, sem close individual): nessas condicoes NAO use confianca 'alta' para defeitos que dependem de distincao fina de tonalidade (preto vs ardido vs melado_peliculado, verde vs palido) — use no maximo 'media', mesmo que o padrao pareca visivel. So use 'alta' nesses casos se o(s) grao(s) especifico(s) que embasam o defeito estiverem em primeiro plano, nitidos e isolados o suficiente para julgar a cor isoladamente, sem influencia de sombra ou grãos vizinhos.\n"+
"8. REGRA ESPECIFICA PRETO vs ARDIDO (par mais confundido do catalogo): preto exige coloracao OPACA uniforme, sem QUALQUER variacao de tom marrom — e um defeito mais raro e mais grave. Se houver duvida real entre os dois (o que e comum em foto de longe/amontoada), classifique como 'ardido' (mais comum, e o erro de classificar ardido como preto e mais grave que o inverso) com confianca 'media', em vez de cravar 'preto' com confianca 'alta'.\n"+
"9. LIMITE DE ITENS: reporte no MAXIMO 4 defeitos por amostra, priorizando os mais evidentes e de maior impacto pratico (nesta ordem de prioridade: fungo (sempre primeiro, e questao de seguranca alimentar) > preto, ardido, brocado_sujo > outros brocados > chocho > verde > demais). Se identificar mais candidatos alem desses 4, NAO os inclua — e melhor uma lista curta e confiavel do que uma lista longa com itens duvidosos. Isso vale mesmo que a amostra pareca ter muitos problemas: reporte os mais claros primeiro.\n"+
"10. Antes de finalizar cada item, pergunte-se: 'eu conseguiria apontar o grao exato que embasa isso numa captura de tela ampliada?' Se a resposta for nao (o padrao e mais uma impressao geral da amostra do que um grao especifico e identificavel), rebaixe a confianca para 'baixa' ou remova o item.\n"+
"11. CUIDADO COM ILUMINACAO/BALANCO DE BRANCO EM DEFEITOS DE COR (melado_peliculado, palido, verde, ardido): esses defeitos so fazem sentido como CONTRASTE — alguns graos com tom diferente da MAIORIA da propria amostra. Se PRATICAMENTE TODOS os graos da foto compartilham o mesmo tom (ex: amostra inteira com aspecto amarelado/dourado/avermelhado uniforme, sem grupo de graos verde-acinzentados normais para comparar), isso e sinal MUITO mais provavel de luz solar direta, sombra colorida ou balanco de branco da camera do que de um defeito real generalizado — nesse caso NAO reporte melado_peliculado nem palido como defeito do lote inteiro; ou omita o item, ou, se ainda assim mencionar, use confianca 'baixa' e deixe claro no campo 'acao' que pode ser efeito de iluminacao da foto, recomendando novo fotografo em luz difusa/sombra neutra para confirmar.\n"+
"12. RESUMO CONSOLIDADO DO LOTE (campos 'resumo_geral' e 'recomendacao_processamento', preencher SOMENTE se houver 2 ou mais defeitos no array 'defeitos'; se houver 0 ou 1 defeito, deixe os dois campos como string vazia \"\"): depois de listar os defeitos individuais, dê um passo atras e pense na CAUSA RAIZ comum que pode estar por tras de VARIOS defeitos ao mesmo tempo — o exemplo mais comum e falta de uniformidade na colheita (mistura de fruto verde, maduro e passa no mesmo lote), que sozinha explica simultaneamente verde, chocho/mal_granado e parte dos ardidos. So aponte uma causa raiz comum se ela realmente conecta a MAIORIA dos defeitos listados — nao force uma narrativa se os defeitos parecem ter origens desconexas (ex: brocado e um problema de praga na lavoura, sem relacao com uniformidade de colheita). Em 'recomendacao_processamento', sugira passos PRATICOS de reprocessamento/separacao do lote (ex: peneira para separar por tamanho, mesa densimetrica ou lavador para separar por densidade/peso, catacao manual ou eletronica para retirar os graos defeituosos antes de vender ou torrar) — SEMPRE dentro do escopo de separacao/limpeza fisica do lote, NUNCA mencionando preco, venda, 'Tipo' oficial ou classificacao de bebida. Ambos os campos devem ter no maximo 3-4 frases curtas cada.\n\n"+
"RESPONDA SOMENTE JSON sem texto extra:\n"+
"{\"defeitos\":[{\"nome\":\"nome popular do defeito em portugues\",\"chave\":\"uma_das_chaves_do_catalogo_acima\",\"visto\":\"o que exatamente foi visto na foto que embasa essa identificacao\",\"confianca\":\"alta|media|baixa\",\"causa\":\"causa provavel especifica, baseada no catalogo\",\"acao\":\"orientacao pratica de manejo, nunca sobre venda/bebida/tipo\"}],\"resumo_geral\":\"causa raiz comum conectando os defeitos, ou string vazia se nao houver 2+ defeitos ou nao houver conexao clara\",\"recomendacao_processamento\":\"passos praticos de separacao/reprocessamento do lote, ou string vazia\"}";
  try {
    var abortCtrl = new AbortController();
    req.on("close", function(){ try { abortCtrl.abort(); } catch(e){} });
    var rGr=await fetch(URL_MODELO_PRODUCAO,{
      method:"POST",
      signal: abortCtrl.signal,
      headers: headersModeloProducao(),
      body:JSON.stringify(corpoModeloProducao({model:MODELO_PRODUCAO,max_tokens:1800,temperature:0,
        messages:[
          {role:"system",content: sistemaGraos + "\n\n" + (contextoG||"Sem contexto regional adicional.")},
          {role:"user",content:[{type:"image_url",image_url:{url:"data:"+tipo+";base64,"+imagem}}]}
        ]}))
    });
    var dGr=await rGr.json();
    if(dGr.error) console.error("ERRO MODELO /identifica-defeito-grao:", JSON.stringify(dGr.error));
    var txtGr=dGr.choices&&dGr.choices[0]&&dGr.choices[0].message?dGr.choices[0].message.content:"";
    var resultadoGr=extrairJSON(txtGr);
    logUsoAnalise(userId, "graos", MODELO_PRODUCAO_LOG, normalizarUsageOpenRouter(dGr.usage), regiao);
    if(resultadoGr && resultadoGr.defeitos){
      res.json(resultadoGr);
    } else {
      console.error("EXTRAIRJSON FALHOU GRAOS. Tamanho texto:", txtGr.length, "| Ultimos 300 chars:", txtGr.substring(Math.max(0,txtGr.length-300)));
      res.json({defeitos:[]});
    }
  } catch(e) { console.error("ERRO GRAOS CATCH:", e.message); res.status(500).json({ erro:e.message }); }
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

// Trava determinística #2 (mesma logica da acima, para o caso mais grave):
// o LLM tem mostrado tendencia a diagnosticar ferrugem so pela cor alaranjada
// do ponto central, mesmo com o prompt proibindo isso explicitamente (testado
// em 28/07/2026, regra de prompt nao foi suficiente em 2 tentativas). Essa
// funcao intercepta e corrige programaticamente: se o diagnostico for
// "ferrugem" e o texto descritivo indicar que a face inferior nao foi
// confirmada (ou seja, nao ha confirmacao real de po/esporulacao), troca
// automaticamente para "mancha_manteigosa", movendo a suspeita de ferrugem
// para o campo diagnostico_diferencial. Nao depende do modelo obedecer nada.
var PRODUTOS_MANCHA_MANTEIGOSA = [
  { nome:"Azoxistrobina+Difenoconazol 325SC", nome_comercial:"", tipo:"sistemico", dose_min:0.3, dose_max:0.4, unidade:"L", por:"hectare", proporcao_por_litro:0.3, unidade_proporcao:"mL", intervalo_reaplicacao:14, carencia_dias:7 },
  { nome:"Oxicloreto Cobre 840WP", nome_comercial:"", tipo:"protetor", dose_min:2, dose_max:2.5, unidade:"kg", por:"hectare", proporcao_por_litro:2.5, unidade_proporcao:"g", intervalo_reaplicacao:14, carencia_dias:7 }
];
function corrigirFerrugemSemConfirmacao(resultado) {
  if(!resultado||!resultado.diagnosticos||!resultado.diagnosticos.length) return resultado;
  resultado.diagnosticos.forEach(function(d){
    if(!d||d.diagnostico!=="ferrugem") return;
    // Fonte primaria: campo estruturado que o modelo e obrigado a preencher
    // (muito mais confiavel que tentar detectar "nao confirmado" em texto
    // livre — testado em 28/07/2026, o modelo encontra frases novas pra
    // escapar do regex a cada tentativa, ex: "vista por transparencia").
    var campoPresente = d.po_esporulacao_confirmado === true || d.po_esporulacao_confirmado === false;
    var confirmadoPeloCampo = campoPresente ? d.po_esporulacao_confirmado===true : null;
    var texto=((d.visto||"")+" "+(d.diagnostico_diferencial||"")+" "+(d.acao||"")).toLowerCase();
    var semConfirmacaoTexto = /face inferior (n[aã]o|nao)|n[aã]o (est[aá]|foi|permite) .*(vis[ií]vel|confirmar).*inferior|sem confirma|n[aã]o (e|é) confirmad|confirma[cç][aã]o definitiva|sugere esporula[cç][aã]o|n[aã]o confirmada visualmente|vista por transpar[eê]ncia|ausência de visualiza[cç][aã]o da face inferior/i.test(texto);
    var comConfirmacaoTexto = /p[oó] (alaranjado )?(confirmado|vis[ií]vel na face inferior|que suja)|esporula[cç][aã]o confirmada|pustulas? vis[ií]ve(l|is) na face inferior/i.test(texto);
    // Decisao: se o campo estruturado veio preenchido, ele manda. Se nao veio
    // (modelo antigo/esqueceu), cai pro regex como rede de seguranca.
    var deveCorrigir = campoPresente ? (confirmadoPeloCampo===false) : (semConfirmacaoTexto && !comConfirmacaoTexto);
    if(deveCorrigir){
      var suspeitaFerrugem = "Suspeita de ferrugem tambem considerada (ponto central com coloracao alaranjada), mas sem confirmacao de po/esporulacao na face inferior — fotografe a face de baixo desta folha para descartar ou confirmar ferrugem antes de decidir o tratamento. "+(d.diagnostico_diferencial||"");
      d.diagnostico="mancha_manteigosa";
      if(d.confianca==="alta") d.confianca="media";
      d.diagnostico_diferencial=suspeitaFerrugem.trim();
      d.acao="Fotografe a face de baixo (inferior) desta folha para descartar ferrugem antes de tratar. "+AVISO_FACE_BAIXO+"Se nao houver po alaranjado que suja o dedo, trate como mancha manteigosa: "+(d.acao||"aplicar fungicida sistemico + protetor.");
      d.fungicidas=PRODUTOS_MANCHA_MANTEIGOSA;
    }
    delete d.po_esporulacao_confirmado; // campo interno, nao deve vazar pro app
  });
  return resultado;
}

// Trava determinística #3: corta achados secundarios de confianca 'baixa'
// quando ja existe outro diagnostico de confianca media/alta no mesmo
// resultado — reduz ruido (ex: pontinhos ambiguos na folha classificados
// como mancha_manteigosa so por estarem la, ao lado de um diagnostico
// principal solido). Mantem um achado de baixa confianca se ele for o
// UNICO da foto, porque nesse caso um alerta incerto ainda tem valor
// (melhor avisar "fique de olho" do que nao dizer nada).
function focarNoPrincipal(resultado) {
  if(!resultado||!resultado.diagnosticos||resultado.diagnosticos.length<=1) return resultado;
  var temConfiavel = resultado.diagnosticos.some(function(d){ return d && d.confianca!=="baixa"; });
  if(!temConfiavel) return resultado; // todos incertos — mantem todos, e a unica info que temos
  resultado.diagnosticos = resultado.diagnosticos.filter(function(d){ return d && d.confianca!=="baixa"; });
  if(resultado.diagnosticos.length===0){
    resultado.diagnosticos=[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel identificar um problema com confianca. Tente uma foto mais proxima e com boa luz.",fungicidas:[]}];
  }
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
  "calcio":             { arquivo:"deficiencia_calcio.jpg",     legenda:"Deficiência de Cálcio: amarelecimento nas bordas das folhas novas" },
  "boro":               { arquivo:"deficiencia_boro.jpg",       legenda:"Deficiência de Boro: morte da gema apical, brotação em leque, folhas retorcidas" },
  "zinco":              { arquivo:"deficiencia_zinco.jpg",      legenda:"Deficiência de Zinco: folhas novas estreitas, quebradiças e ásperas, em roseta" }
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
      "Cerrado Mineiro":"solos acidos com deficiencia frequente de Calcio Magnesio e Boro. Alta incidencia de ferrugem em anos umidos. Especie predominante: Coffea arabica.",
      "Sul de Minas":"altitudes acima de 800m favorecem Phoma e Cercosporiose. Risco de deficiencia de Zinco. Especie predominante: Coffea arabica.",
      "Mogiana":"regiao quente 22-26C com risco de acaro vermelho e broca em periodos secos. Deficiencia de Potassio comum. Cercosporiose e a doenca fungica foliar mais frequente da regiao. Especie predominante: Coffea arabica.",
      "Matas de Minas":"alta umidade favorece ferrugem e bicho-mineiro. Deficiencia de Fosforo e Magnesio. Especie predominante: Coffea arabica.",
      "Chapada Diamantina":"altitude elevada favorece Phoma. Deficiencia de Nitrogenio e Boro. Especie predominante: Coffea arabica.",
      "Planalto da Bahia":"clima seco favorece acaro vermelho. Deficiencia de Ferro em solos alcalinos. Especie predominante: Coffea arabica.",
      "Rondonia":"alta umidade favorece ferrugem, antracnose, cercosporiose e mancha de corynespora (bem documentada nesta regiao). Solos acidos. Especie predominante: Coffea canephora (conilon/robusta) - praticamente toda a lavoura local.",
      "Norte do Parana":"risco de geadas maio-agosto. Risco de deficiencia de Manganes. Especie predominante: Coffea arabica.",
      "Espirito Santo":"regiao mista: Conilon Capixaba nas areas mais baixas e quentes ao norte (especie Coffea canephora, onde corynespora e relevante), e Coffea arabica nas Montanhas do Espirito Santo ao sul, altitude mais elevada. Alta umidade favorece cercosporiose e cochonilha em ambas.",
      "Alta Paulista":"clima quente e seco favorece acaro vermelho. Deficiencia de Zinco. Especie predominante: Coffea arabica."
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

// Prompt principal extraido para arquivo externo em 29/07/2026 — antes
// era uma string gigante concatenada dentro do codigo (36 mil caracteres),
// dificil de editar sem erro de escape de aspas. Agora fica em
// prompt-diagnostico.txt, carregado uma vez na inicializacao do servidor.
// isVideo nao e usado (o prompt e igual para foto e video) — mantido no
// parametro so para nao quebrar as chamadas existentes que passam esse argumento.
var PROMPT_DIAGNOSTICO_BASE = fs.readFileSync(__dirname + "/prompt-diagnostico.txt", "utf8");
function buildPromptStatic(isVideo) {
  return PROMPT_DIAGNOSTICO_BASE;
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
initDB().then(function() {
  app.listen(process.env.PORT||8080, function() {
    console.log("🌿 Doutor Cafe API ok — porta", process.env.PORT||8080);
    console.log("   DB:", pool?"PostgreSQL":"memória");
  });
});
