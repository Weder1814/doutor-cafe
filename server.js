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
  basico:   150,
  pro:      300,
  premium:  450
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
    // Gratuito: vitalício, nunca reseta
    return Math.max(0, limite - usadas);
  } else {
    // Plano pago: reseta todo mês
    var mesReset = u.mes_reset || u.mesReset || "";
    if (mesReset !== mesAtual()) {
      return limite; // novo mês, análises resetadas
    }
    return Math.max(0, limite - usadas);
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
          // Plano pago, novo mês: reseta e conta 1
          await pool.query(
            "UPDATE usuarios SET analises_usadas=1, mes_reset=$2, atualizado_em=NOW() WHERE user_id=$1",
            [userId, mes]
          );
        } else {
          // Incrementa normalmente
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
      u.analisesUsadas = 1;
      u.mesReset = mes;
    } else {
      u.analisesUsadas = (u.analisesUsadas||0) + 1;
      if (plano !== "gratuito") u.mesReset = mes;
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
  basico_mensal:  { nome:"Básico Mensal",  valor:29.90,  analises:150 },
  basico_anual:   { nome:"Básico Anual",   valor:299.90, analises:150 },
  pro_mensal:     { nome:"Pro Mensal",     valor:39.90,  analises:300 },
  pro_anual:      { nome:"Pro Anual",      valor:399.90, analises:300 },
  premium_mensal: { nome:"Premium Mensal", valor:49.90,  analises:450 },
  premium_anual:  { nome:"Premium Anual",  valor:499.90, analises:450 }
};

// ── ENDPOINTS BÁSICOS ─────────────────────────────────────────
app.get("/", function(req, res) { res.json({ status:"online", app:"Doutor Cafe API", db: pool?"postgres":"memoria" }); });
app.get("/ping", function(req, res) { res.json({ ok:true, ts:Date.now() }); });

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

  // Validar CPF matematicamente
  if (cpf && !validarCPF(cpf)) {
    return res.status(400).json({ erro:"CPF inválido. Verifique os números digitados." });
  }

  // Verificar se CPF já existe — retorna o userId original
  if (cpf) {
    try {
      var existente = await dbGetUserByCPF(cpf);
      if (existente) {
        console.log("⚠️ CPF já cadastrado:", cpf, "-> retornando userId existente");
        var restantes = analisesRestantes(existente);
        return res.json({
          ok:true,
          userId: existente.user_id||existente.userId,
          jaExistia:true,
          plano: existente.plano||"gratuito",
          analisesUsadas: existente.analises_usadas||existente.analisesUsadas||0,
          analisesRestantes: restantes
        });
      }
    } catch(e) { console.error("verificarCPF:", e.message); }
  }

  try {
    await dbSaveUser({ userId, cpf, celular, nome, pin, email, regiao, plano:"gratuito", analisesUsadas:0, mesReset:"" });
    console.log("✅ Cadastro:", nome, "| DB:", pool?"postgres":"memoria");
    res.json({ ok:true, userId, analisesRestantes: LIMITES.gratuito });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── LOGIN CELULAR + PIN ───────────────────────────────────────
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
      limite: LIMITES[u.plano||"gratuito"]||15
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
    } catch(e) {
      res.status(500).json({ erro:e.message });
    }
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
    } catch(e) {
      res.status(500).json({ erro:e.message });
    }
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
    } catch(e) {
      res.status(500).json({ erro:e.message });
    }
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
    var lista = Object.values(usuariosMemoria);
    res.json({ total:lista.length, usuarios:lista });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
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
    if (!u) return res.json({ plano:"gratuito", analisesUsadas:0, analisesRestantes:15, limite:15 });
    var restantes = analisesRestantes(u);
    res.json({
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0,
      analisesRestantes: restantes,
      limite: LIMITES[u.plano||"gratuito"]||15
    });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── DIAGNÓSTICO SSE ───────────────────────────────────────────
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

  var prompt = buildPrompt(regiao, altitude, false);

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
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2000, stream:true,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:tipo, data:imagem }},
        { type:"text", text:prompt }
      ]}]
    })
  })
  .then(function(r) {
    var Readable = require("stream").Readable;
    var stream = Readable.fromWeb(r.body);
    var buf="", texto="", parciaisEnviados=0, completosEnviados=0, diagsCompletos=[];

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

// ── DIAGNÓSTICO JSON (fallback iOS) ──────────────────────────
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

  var prompt=buildPrompt(regiao,altitude,false);
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:tipo,data:imagem}},
        {type:"text",text:prompt}
      ]}]})
    });
    var d=await r.json();
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(!resultado||!resultado.diagnosticos||resultado.diagnosticos.length===0){
      resultado={diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente uma foto mais clara.",fungicidas:[]}]};
    }
    res.json(resultado);
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── PLANO DE AÇÃO ─────────────────────────────────────────────
app.post("/plano-acao", async function(req, res) {
  var diagnosticos=req.body.diagnosticos||[], regiao=req.body.regiao||null;
  if(diagnosticos.length===0) return res.json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"" });

  var regiaoCtx=regiao?" Regiao: "+regiao+".":"";
  var resumoDiags=diagnosticos.map(function(d,i){
    var f=d.fungicidas&&d.fungicidas.length>0
      ?d.fungicidas.map(function(f){return(f.nome_comercial||f.nome)+" ("+f.tipo+")"}).join(", ")
      :"sem fungicida indicado";
    return (i+1)+". "+d.diagnostico+" estagio "+d.estagio+" — produtos individuais: "+f;
  }).join("\n");

  var prompt =
"Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira."+regiaoCtx+"\n\n"+
"Diagnostico encontrou:\n"+resumoDiags+"\n\n"+
"REGRAS OBRIGATORIAS DE COMPATIBILIDADE — VIOLACAO E ERRO GRAVE:\n"+
"1. PROIBIDO: dois triazois na mesma calda OU em aplicacoes consecutivas sem intervalo adequado.\n"+
"   TRIAZOIS: Tebuconazol=Folicur, Ciproconazol=Priori Xtra/Opera, Difenoconazol=Amistar Top/Score, Epoxiconazol=Opera.\n"+
"   ROTACAO CORRETA apos Amistar Top: Cercobin+Cuprogarb. Apos Folicur: Priori Xtra ou Amistar Top. Apos Priori Xtra: Folicur ou Amistar Top.\n"+
"2. PROIBIDO: duas estrobilurinas juntas.\n"+
"3. PERMITIDO: protetor cuproso com qualquer sistemico.\n"+
"4. PERMITIDO: Cercobin com qualquer produto.\n"+
"5. Intervalo minimo: 14-21 dias.\n\n"+
"FORMATO JSON:\n"+
"{\"resumo_geral\":\"...\",\"urgente\":\"...\",\"em_21_dias\":\"...\",\"nutricao\":\"...\",\"resumo\":\"frase curta\"}";

  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:800,messages:[{role:"user",content:[{type:"text",text:prompt}]}]})
    });
    var d=await r.json();
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    res.json(resultado||{ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"" });
  } catch(e) {
    res.json({ resumo_geral:"", urgente:"", em_21_dias:"", nutricao:"", resumo:"" });
  }
});

// ── DIAGNÓSTICO VÍDEO ─────────────────────────────────────────
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
  }

  var prompt=buildPrompt(regiao,altitude,true);
  var content=[];
  frames.forEach(function(frame,i){ content.push({type:"text",text:"Frame "+(i+1)+":"}); content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:frame}}); });
  content.push({type:"text",text:prompt});
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2000,messages:[{role:"user",content}]})
    });
    var d=await r.json();
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    res.json(resultado||{diagnosticos:[{diagnostico:"saudavel",estagio:1,confianca:"baixa",visto:"",acao:"Nao foi possivel analisar. Tente novamente.",fungicidas:[]}]});
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── ANÁLISE DE SOLO ───────────────────────────────────────────
app.post("/analise-solo", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var prompt="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira com base nas normas do Incaper e Embrapa."+contexto+"\n\nAnalise este laudo de analise de solo e faca recomendacoes especificas para o cultivo de cafe arabica.\n\nRESPONDA SOMENTE JSON sem texto extra:\n{\"acao\":\"recomendacao completa em linguagem simples\",\"valores\":{\"pH\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"MO\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"P\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"K\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Ca\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Mg\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"V%\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"B\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"},\"Zn\":{\"valor\":\"valor\",\"status\":\"ok|baixo|alto\"}}}";
  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:tipo,data:imagem}},{type:"text",text:prompt}]}]})
    });
    var d=await r.json();
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    res.json(resultado||{acao:"Nao foi possivel ler o laudo. Verifique a foto e tente novamente.",valores:{}});
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── IDENTIFICA DANINHA ────────────────────────────────────────
app.post("/identifica-daninha", async function(req, res) {
  var imagem=req.body.imagem, tipo=req.body.tipo||"image/jpeg", regiao=req.body.regiao||null;
  var contexto=regiao?" O produtor esta na regiao "+regiao+".":"";
  var prompt="Voce e o Doutor Cafe, agronomista especialista em cafeicultura brasileira. Fontes: Aegro e Rehagro."+contexto+"\n\n"+
"REGRA MAIS IMPORTANTE: Identifique TODAS as especies de plantas daninhas visiveis na imagem.\n\n"+
"PLANTAS DANINHAS DO CAFE:\n"+
"1. PICAO-PRETO (Bidens pilosa): sementes com espinhos, flores amarelas. Solo fertil. PRE: Goal BR 5-6L/ha. POS: Goal BR 6L/ha.\n"+
"2. CAPIM-AMARGOSO (Digitaria insularis): GRAMÍNEA perene touceiras 50-100cm, pelos brancos nas bordas. Solo degradado. ACCase: Fusilade, Verdict Max 0,2-0,4L/ha.\n"+
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): GRAMÍNEA touceiras rasas em leque, espiga pe de galinha. Solo COMPACTADO. ACCase + glifosato.\n"+
"4. BUVA/VOADEIRA (Conyza spp.): ereta ate 2m, folhas ESTREITAS, aspecto espeto. NAO gramínea. Galigan 240EC 3L/ha, Heat 700WG 70-100g/ha.\n"+
"5. CARURU (Amaranthus spp.): 20cm-2m. Heat 700WG 70g/ha.\n"+
"6. TIRIRICA (Cyperus rotundus): folhas triangulares. Solo DRENAGEM RUIM. Glifosato + Diuron.\n"+
"7. CORDA-DE-VIOLA (Ipomoea spp.): TREPADEIRA vigorosa, folhas CORDADAS em forma de coracao grandes 5-15cm, flores roxas ou brancas em forma de trombeta, caule volvel enrolando em TUDO ao redor. Cobre completamente o cafeeiro sufocando-o. Solo FERTIL disturbado. Aurora 400EC 1-1,5L/ha POS-emergencia precoce. Ally 600WG 4-6g/ha. Controle URGENTE antes de florescer para evitar banco de sementes.\n"+
"8. CAPIM-GORDURA (Melinis minutiflora): GRAMÍNEA peluda viscosa cheiro mel, cor amarelada. ACCase: Select 240EC 0,45L/ha.\n"+
"9. CAPIM-BRAQUIARIA (Urochloa spp.): gramínea aliada entrelinhas, problema na linha. ACCase.\n"+
"10. TRAPOERABA (Commelina benghalensis): rasteira, flores azuis. Solo UMIDO. 2,4-D.\n"+
"11. GUANXUMA (Sida spp.): arbusto flores amarelas. Solo DEGRADADO. 2,4-D.\n"+
"12. MARIA-PRETINHA (Solanum americanum): frutos pretos TOXICOS. Glifosato, 2,4-D.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"plantas\":[{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo\",\"acao\":\"o que fazer\",\"urgencia\":\"alta|media|baixa\",\"produtos\":[{\"nome\":\"nome comercial\",\"dose\":\"dose pratica\",\"como_usar\":\"instrucao\"}],\"alerta\":\"aviso importante\"}],\"indicador_geral\":\"o que indica sobre o solo\",\"manejo_integrado\":\"estrategia geral\"}";

  try {
    var r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:tipo,data:imagem}},{type:"text",text:prompt}]}]})
    });
    var d=await r.json();
    var txt=d.content&&d.content[0]?d.content[0].text:"";
    var resultado=extrairJSON(txt);
    if(resultado){
      if(!resultado.plantas) resultado={ plantas:[resultado], indicador_geral:resultado.indicador||"", manejo_integrado:resultado.manejo_preventivo||"" };
      if(!resultado.plantas||resultado.plantas.length===0) resultado.plantas=[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}];
      res.json(resultado);
    } else {
      res.json({plantas:[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto.",urgencia:"baixa",produtos:[],alerta:""}],indicador_geral:"",manejo_integrado:""});
    }
  } catch(e) { res.status(500).json({ erro:e.message }); }
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
function buildPrompt(regiao, altitude, isVideo) {
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
    contextoRegional="\n\nCONTEXTO REGIONAL: Produtor na regiao "+regiao+". "+info;
    if(altitude){ contextoRegional+=" Altitude: "+altitude+"m."; if(altitude>900) contextoRegional+=" Altitude alta: maior risco de Phoma e Cercosporiose."; if(altitude<600) contextoRegional+=" Altitude baixa: maior risco de ferrugem acaro vermelho e broca."; }
  }
  var introVideo=isVideo?"Voce recebeu multiplos frames de um video da mesma planta. Analise TODOS os frames em conjunto.\n\n":"";
  return "Voce e o Doutor Cafe, fitopatologista e fisiologista especialista em cafeicultura brasileira com 36 anos de experiencia."+contextoRegional+"\n\n"+introVideo+
"REGRA MAIS IMPORTANTE: Voce DEVE listar TODOS os problemas visiveis na imagem. Nunca omita um diagnostico por ja ter encontrado outro. NUNCA diagnostique saudavel se houver qualquer mancha, lesao, descoloracao ou sintoma visivel na folha.\n\n"+
"PRIORIDADE MAXIMA — FERRUGEM (Hemileia vastatrix): manchas AMARELO-ALARANJADAS face INFERIOR, po alaranjado. Se encontrar QUALQUER sinal alaranjado: DIAGNOSTIQUE como ferrugem.\n\n"+
"DOENCAS FUNGICAS:\nferrugem=pustulas ALARANJADAS face INFERIOR.\ncercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\nhelmintosporiose=manchas GRANDES marrom-escuras HALOS CONCENTRICOS halo amarelo extenso.\nantracnose=lesoes AFUNDADAS pretas bordas irregulares.\nphoma=manchas NECROTICAS negras SEM halo FOLHAS NOVAS.\naureolada=bacteriana manchas pardas HALO AMARELO GRANDE.\nmancha_manteigosa=manchas ENCHARCADAS OLEOSAS.\ncorynespora=manchas IRREGULARES marrom-avermelhadas halo amarelo MAIORES que cercosporiose.\nkoleroga=FOLHAS CAIDAS presas por FIOS DE MICELIO.\n\n"+
"PRAGAS:\nbicho=TRILHAS SERPENTINAS castanhas dentro da folha.\nacaro=folha BRONZEADA acinzentada opaca.\ncochonilha=massas BRANCAS algodonosas em ramos.\nbroca=FURO CIRCULAR 1-2mm no FRUTO.\n\n"+
"DEFICIENCIAS:\nnitrogenio=folha TODA AMARELA UNIFORME folhas velhas.\nmagnesio=nervuras VERDES tecido AMARELO internerval.\npotassio=QUEIMA bordas e pontas folhas velhas.\nferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\ncalcio=folhas NOVAS deformadas ENCURVADAS.\nboro=folhas NOVAS QUEBRADICAS.\nzinco=folhas NOVAS ESTREITAS roseta.\n\n"+
"FRUTOS:\nfruto_verde=verde firme sem lesoes.\nfruto_maduro=VERMELHO ou AMARELO cereja brilhante.\nfruto_passado=ESCURECIDO enrugado seco.\nbroca=FURO CIRCULAR escuro 1-2mm.\nantracnose_fruto=lesoes AFUNDADAS CIRCULARES marrom-escuras.\n\n"+
"PRODUTOS:\nferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.75 unidade_proporcao:mL intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\ncercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\nhelmintosporiose: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\nantracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\nbicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha proporcao_por_litro:0.1 unidade_proporcao:g intervalo:30.\nacaro: Abamectina 18EC acaricida 0,5-0,75L/ha proporcao_por_litro:0.5 unidade_proporcao:mL intervalo:21.\nbroca: Clorpirifos 480EC inseticida 1,5-2L/ha proporcao_por_litro:1.75 unidade_proporcao:mL intervalo:30.\n\n"+
"INSTRUCOES FINAIS: Liste TODOS os problemas. Ordene do mais grave. Deficiencias nutricionais: fungicidas:[]. NUNCA retorne saudavel se houver sintoma.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual\",\"acao\":\"o que fazer\",\"fungicidas\":[{\"nome\":\"generico\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
initDB().then(function() {
  app.listen(process.env.PORT||8080, function() {
    console.log("🌿 Doutor Cafe API ok — porta", process.env.PORT||8080);
    console.log("   DB:", pool?"PostgreSQL":"memória");
  });
});
