var express = require("express");
var cors = require("cors");
var app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── VARIÁVEIS DE AMBIENTE ──────────────────────────────────────
var MP_TOKEN   = process.env.MP_ACCESS_TOKEN;
var BASE_URL   = process.env.BASE_URL || "https://doutor-cafe-production.up.railway.app";
var DB_URL     = process.env.DATABASE_URL;   // PostgreSQL do Railway
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
      max: 10,                  // máximo de conexões simultâneas
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

// Fallback em memória (para desenvolvimento local)
var usuariosMemoria = {};

// ── INICIALIZAR TABELAS ────────────────────────────────────────
async function initDB() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        user_id     TEXT PRIMARY KEY,
        cpf         TEXT,
        celular     TEXT,
        nome        TEXT,
        pin         TEXT,
        email       TEXT,
        regiao      TEXT,
        plano       TEXT DEFAULT 'gratuito',
        plano_id    TEXT,
        analises_usadas INTEGER DEFAULT 0,
        criado_em   TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_usuarios_celular ON usuarios(celular);
      CREATE INDEX IF NOT EXISTS idx_usuarios_cpf ON usuarios(cpf);

      CREATE TABLE IF NOT EXISTS analises (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
        talhao_id   TEXT,
        diagnosticos JSONB,
        foto_thumb  TEXT,
        regiao      TEXT,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analises_user ON analises(user_id);
      CREATE INDEX IF NOT EXISTS idx_analises_talhao ON analises(talhao_id);

      CREATE TABLE IF NOT EXISTS talhoes (
        id          TEXT PRIMARY KEY,
        user_id     TEXT REFERENCES usuarios(user_id) ON DELETE CASCADE,
        nome        TEXT,
        variedade   TEXT,
        idade       INTEGER,
        area        NUMERIC,
        analises    JSONB DEFAULT '[]',
        criado_em   TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_talhoes_user ON talhoes(user_id);

      CREATE TABLE IF NOT EXISTS pagamentos (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        plano_id    TEXT,
        status      TEXT,
        valor       NUMERIC,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
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
      // fallback sem regexp
      try {
        var r2 = await pool.query("SELECT * FROM usuarios WHERE celular=$1", [cel]);
        return r2.rows[0] || null;
      } catch(e2) { console.error("dbGetUserByCelular:", e2.message); }
    }
  }
  return Object.values(usuariosMemoria).find(function(u){ return (u.celular||"").replace(/[^0-9]/g,"")===cel; }) || null;
}

async function dbSaveUser(u) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO usuarios (user_id,cpf,celular,nome,pin,email,regiao,plano,analises_usadas)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id) DO UPDATE SET
          cpf=EXCLUDED.cpf, celular=EXCLUDED.celular, nome=EXCLUDED.nome,
          pin=EXCLUDED.pin, email=EXCLUDED.email, regiao=EXCLUDED.regiao,
          plano=EXCLUDED.plano, analises_usadas=EXCLUDED.analises_usadas,
          atualizado_em=NOW()
      `, [u.userId||u.user_id, u.cpf||"", u.celular||"", u.nome||"",
          u.pin||"", u.email||"", u.regiao||"", u.plano||"gratuito", u.analisesUsadas||0]);
      return true;
    } catch(e) { console.error("dbSaveUser:", e.message); }
  }
  usuariosMemoria[u.userId||u.user_id] = u;
  return true;
}

async function dbIncrementarAnalise(userId) {
  if (pool) {
    try {
      await pool.query(
        "UPDATE usuarios SET analises_usadas=analises_usadas+1, atualizado_em=NOW() WHERE user_id=$1",
        [userId]
      );
      return true;
    } catch(e) { console.error("dbIncrementarAnalise:", e.message); }
  }
  if (usuariosMemoria[userId]) usuariosMemoria[userId].analisesUsadas = (usuariosMemoria[userId].analisesUsadas||0)+1;
  return true;
}

async function dbAtualizarPlano(userId, plano, planoId) {
  if (pool) {
    try {
      await pool.query(
        "UPDATE usuarios SET plano=$2, plano_id=$3, analises_usadas=0, atualizado_em=NOW() WHERE user_id=$1",
        [userId, plano, planoId||""]
      );
      return true;
    } catch(e) { console.error("dbAtualizarPlano:", e.message); }
  }
  if (usuariosMemoria[userId]) { usuariosMemoria[userId].plano=plano; usuariosMemoria[userId].planoId=planoId; }
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
var rateMap = {};          // userId -> { count, resetAt }
var RATE_LIMIT_ANALISE = 10;   // máx 10 análises por minuto por usuário
var RATE_LIMIT_JANELA  = 60 * 1000; // 1 minuto

function checkRateLimit(userId) {
  var agora = Date.now();
  if (!rateMap[userId] || agora > rateMap[userId].resetAt) {
    rateMap[userId] = { count: 1, resetAt: agora + RATE_LIMIT_JANELA };
    return true; // permitido
  }
  rateMap[userId].count++;
  if (rateMap[userId].count > RATE_LIMIT_ANALISE) {
    return false; // bloqueado
  }
  return true;
}

// Limpar rate map a cada 5 minutos para não vazar memória
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

  try {
    await dbSaveUser({ userId, cpf, celular, nome, pin, email, regiao, plano:"gratuito", analisesUsadas:0 });
    console.log("✅ Cadastro:", nome, "| DB:", pool?"postgres":"memoria");
    res.json({ ok:true, userId });
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

    res.json({
      ok:true,
      userId: u.user_id||u.userId,
      nome: u.nome,
      celular: u.celular,
      email: u.email,
      regiao: u.regiao,
      plano: u.plano||"gratuito",
      analisesUsadas: u.analises_usadas||u.analisesUsadas||0
    });
  } catch(e) {
    res.status(500).json({ erro:e.message });
  }
});

// ── INCREMENTAR ANÁLISE ───────────────────────────────────────
app.post("/incrementar-analise", async function(req, res) {
  var userId = req.body.userId;
  if (userId) await dbIncrementarAnalise(userId);
  res.json({ ok:true });
});

// ── SALVAR ANÁLISE NO SERVIDOR (sync backup) ──────────────────
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
      var r = await pool.query("SELECT user_id,nome,celular,email,regiao,plano,analises_usadas,criado_em FROM usuarios ORDER BY criado_em DESC");
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
  // Processar aprovação de pagamento
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
          // Salvar pagamento
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
      // Salvar pagamento pendente
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
    res.json({ plano:u?(u.plano||"gratuito"):"gratuito", analisesUsadas:u?(u.analises_usadas||u.analisesUsadas||0):0 });
  } catch(e) { res.status(500).json({ erro:e.message }); }
});

// ── DIAGNÓSTICO SSE (com rate limiting) ───────────────────────
app.post("/diagnostico", function(req, res) {
  var imagem  = req.body.imagem;
  var tipo    = req.body.tipo||"image/jpeg";
  var regiao  = req.body.regiao||null;
  var altitude= req.body.altitude||null;
  var userId  = req.body.userId||"anonimo";

  // Rate limiting
  if (!checkRateLimit(userId)) {
    return res.status(429).json({ erro:"Muitas análises em sequência. Aguarde 1 minuto." });
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
"   TRIAZOIS (todos proibidos de combinar entre si):\n"+
"   - Tebuconazol = Folicur 200EC\n"+
"   - Ciproconazol = componente do Priori Xtra e Opera\n"+
"   - Difenoconazol = componente do Amistar Top e Score\n"+
"   - Epoxiconazol = componente do Opera\n"+
"   CONSEQUENCIA: Se usou Amistar Top (tem Difenoconazol) essa semana, em 21 dias NAO pode usar Folicur (Tebuconazol). Sao ambos triazois — PROIBIDO.\n"+
"   ROTACAO CORRETA em 21 dias apos Amistar Top: use Cercobin (Tiofanato Metilico, NAO e triazol) + Cuprogarb (cobre, protetor).\n"+
"   ROTACAO CORRETA em 21 dias apos Folicur: use Priori Xtra OU Amistar Top.\n"+
"   ROTACAO CORRETA em 21 dias apos Priori Xtra: use Folicur OU Amistar Top — NAO use Opera (ambos tem estrobilurina).\n\n"+
"2. PROIBIDO: duas estrobilurinas juntas. Estrobilurinas: Azoxistrobina (Amistar Top, Priori Xtra), Piraclostrobina (Opera).\n"+
"3. PERMITIDO: protetor cuproso (Cuprogarb, Recop, Oxicloreto de Cobre) com qualquer sistemico.\n"+
"4. PERMITIDO: Cercobin (Tiofanato Metilico) com qualquer produto — NAO e triazol nem estrobilurina.\n"+
"5. Intervalo minimo entre aplicacoes: 14-21 dias.\n\n"+
"FORMATO DA RESPOSTA:\n"+
"- resumo_geral: 2-3 frases simples. Use nomes populares.\n"+
"- urgente: o que fazer ESSA SEMANA. Produto + dose/ha + dose por tanque 20L.\n"+
"- em_21_dias: proxima aplicacao respeitando OBRIGATORIAMENTE a regra de rotacao acima.\n"+
"- nutricao: correcao nutricional se houver deficiencia. Vazio se nao houver.\n\n"+
"RESPONDA SOMENTE JSON:\n"+
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
"REGRA MAIS IMPORTANTE: Identifique TODAS as especies de plantas daninhas visiveis na imagem — pode haver 2, 3 ou mais especies diferentes ao mesmo tempo. Nao ignore nenhuma planta visivel.\n\n"+
"PLANTAS DANINHAS DO CAFE:\n"+
"1. PICAO-PRETO (Bidens pilosa): sementes com espinhos, flores amarelas. Solo fertil. PRE: Goal BR 5-6L/ha, Ametrina 800 1,5-2,5kg/ha. POS: Goal BR 6L/ha.\n"+
"2. CAPIM-AMARGOSO (Digitaria insularis): GRAMÍNEA perene em TOUCEIRAS grandes 50-100cm, folhas com pelos brancos nas bordas. Solo degradado, resistente ao glifosato. ACCase: Fusilade, Verdict Max 0,2-0,4L/ha, Select 240EC 0,45L/ha.\n"+
"3. CAPIM-PE-DE-GALINHA (Eleusine indica): GRAMÍNEA anual em TOUCEIRAS DENSAS rasteiras, folhas CHATAS em leque, espiga formato pe de galinha. Solo COMPACTADO. ACCase + glifosato. Galigan 240 3L/ha.\n"+
"4. BUVA/VOADEIRA (Conyza spp.): planta ERETA ate 2m, caule vertical, folhas ESTREITAS COMPRIDAS, aspecto espeto. NAO e gramínea. Solo com excesso de glifosato. Controlar com menos de 25cm. Galigan 240EC 3L/ha, Heat 700WG 70-100g/ha, Ally 600WG.\n"+
"5. CARURU (Amaranthus spp.): 20cm-2m. Solo fertil com alto N. Heat 700WG 70g/ha.\n"+
"6. TIRIRICA (Cyperus rotundus): perene, folhas triangulares. Solo DRENAGEM RUIM. Glifosato + Diuron Nortox 800WP.\n"+
"7. CORDA-DE-VIOLA (Ipomoea spp.): trepadeira ate 3m, flores roxas. Solo fertil e umido. Aurora 400EC, Ally 600WG.\n"+
"8. CAPIM-GORDURA (Melinis minutiflora): GRAMÍNEA perene, folhas PELUDAS e VISCOSAS com cheiro forte de mel/gordura, cor verde-amarelada clara, touceiras soltas. Solo baixa fertilidade. ACCase: Select 240EC 0,45L/ha, Verdict Max 0,3L/ha.\n"+
"9. CAPIM-BRAQUIARIA (Urochloa spp.): gramínea aliada nas entrelinhas, problema na linha do cafe. ACCase para controle.\n"+
"10. CAPIM-MARMELADA (Urochloa plantaginea): gramínea anual ate 80cm. Solo fertil. ACCase.\n"+
"11. TRAPOERABA (Commelina benghalensis): rasteira, flores azuis. Solo UMIDO. 2,4-D, carfentrazina.\n"+
"12. GUANXUMA (Sida spp.): arbusto flores amarelas. Solo DEGRADADO. 2,4-D, metsulfurom.\n"+
"13. CAPIM-DE-BURRO (Cynodon dactylon): gramínea rasteira, estoloes. Solo COMPACTADO. ACCase.\n"+
"14. MARIA-PRETINHA (Solanum americanum): frutos pretos TOXICOS. Solo fertil. Glifosato, 2,4-D.\n"+
"15. POAIA-BRANCA (Richardia brasiliensis): rasteira, flores brancas. Solo umido. Goal BR, Ametrina.\n\n"+
"ATENCAO - DIFERENCIAR:\n"+
"BUVA = ereta, nao-gramínea, folhas estreitas compridas, aspecto espeto vertical\n"+
"CAPIM-GORDURA = gramínea PELUDA viscosa com cheiro, folhas mais largas, cor amarelada\n"+
"CAPIM-AMARGOSO = gramínea touceiras altas 50-100cm com pelos brancos nas bordas\n"+
"CAPIM-PE-DE-GALINHA = gramínea touceiras rasas em leque\n"+
"TIRIRICA = folha triangular em secao, flores marrom\n\n"+
"RESPONDA SOMENTE JSON com array de todas as plantas encontradas:\n"+
"{\"plantas\":[{\"nome\":\"nome popular\",\"nome_cientifico\":\"nome cientifico\",\"indicador\":\"o que indica sobre o solo\",\"acao\":\"o que fazer em linguagem simples\",\"urgencia\":\"alta|media|baixa\",\"produtos\":[{\"nome\":\"nome comercial\",\"dose\":\"ex: 3 litros por hectare ou 60mL por tanque 20L\",\"como_usar\":\"instrucao pratica\"}],\"alerta\":\"aviso mais importante\"}],\"indicador_geral\":\"o que a combinacao de plantas indica sobre o solo\",\"manejo_integrado\":\"estrategia para controlar todas juntas\"}";

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
      if(!resultado.plantas||resultado.plantas.length===0) resultado.plantas=[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto com boa iluminacao.",urgencia:"baixa",produtos:[],alerta:""}];
      res.json(resultado);
    } else {
      res.json({plantas:[{nome:"Planta nao identificada",nome_cientifico:"",indicador:"Nao foi possivel identificar",acao:"Fotografe mais de perto com boa iluminacao.",urgencia:"baixa",produtos:[],alerta:""}],indicador_geral:"",manejo_integrado:""});
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
"REGRA MAIS IMPORTANTE: Voce DEVE listar TODOS os problemas visiveis na imagem. Nunca omita um diagnostico por ja ter encontrado outro. Ferrugem, Cercosporiose, Antracnose, Helmintosporiose e deficiencias nutricionais FREQUENTEMENTE ocorrem juntas na mesma folha — liste TODOS. NUNCA diagnostique saudavel se houver qualquer mancha, lesao, descoloracao ou sintoma visivel na folha.\n\n"+
"PRIORIDADE MAXIMA — FERRUGEM (Hemileia vastatrix):\nA ferrugem e a doenca mais importante e comum do cafe no Brasil. SEMPRE verifique:\n- Manchas AMARELO-ALARANJADAS arredondadas na face INFERIOR da folha\n- Po ou pustulas alaranjadas (uredosporos) visiveis na face inferior\n- Manchas cloroticas amarelas correspondentes na face SUPERIOR\nSe encontrar QUALQUER sinal alaranjado ou amarelo-ferrugem: DIAGNOSTIQUE como ferrugem.\n\n"+
"DOENCAS FUNGICAS FOLIARES:\nferrugem=pustulas ALARANJADAS face INFERIOR. A MAIS COMUM.\ncercosporiose=manchas CIRCULARES centro BRANCO-ACINZENTADO halo amarelo FINO.\nhelmintosporiose=manchas GRANDES marrom-escuras HALOS CONCENTRICOS multiplos halo amarelo extenso. Principal causa desfolha severa.\nantracnose=lesoes AFUNDADAS pretas bordas irregulares tecido morto afundado.\nphoma=manchas NECROTICAS negras irregulares SEM halo FOLHAS NOVAS ponteiros.\naureolada=bacteriana. manchas pardas centro necrotico HALO AMARELO GRANDE.\nmancha_manteigosa=manchas ENCHARCADAS OLEOSAS aspecto gorduroso face superior E inferior.\ncorynespora=manchas IRREGULARES marrom-avermelhadas com halo amarelo. MAIORES e mais irregulares que cercosporiose.\nkoleroga=FOLHAS CAIDAS presas aos ramos por FIOS DE MICELIO visivel.\nascochyta=manchas CLARAS centro branco-palido bordas marrons indefinidas nas folhas mais velhas.\nrizoctoniose=manchas aquosas marrons no caule BASE DA PLANTA junto ao solo.\nroseliniose=PONTUACOES ESCURAS microscopicas no caule. Crescimento MICELIAL ESCURO sob casca.\n\n"+
"PRAGAS:\nbicho=TRILHAS SERPENTINAS castanhas dentro da folha.\nacaro=folha BRONZEADA acinzentada opaca face inferior.\ncochonilha=massas BRANCAS algodonosas em ramos e axilas.\nlagarta=areas DESFOLHADAS com lagartas VIVAS visiveis.\nbroca=FURO CIRCULAR 1-2mm no disco floral ou coroa do FRUTO.\nnematoide=planta com AMARELECIMENTO GERAL progressivo sem recuperacao.\n\n"+
"DEFICIENCIAS NUTRICIONAIS:\nnitrogenio=folha TODA AMARELA UNIFORME folhas velhas.\nmagnesio=nervuras VERDES tecido AMARELO internerval folhas velhas.\npotassio=QUEIMA bordas e pontas folhas velhas.\nferro=folhas NOVAS ESBRANQUICADAS nervuras verdes.\ncalcio=folhas NOVAS deformadas ENCURVADAS ponteiros mortos.\nboro=folhas NOVAS QUEBRADICAS deformadas.\nzinco=folhas NOVAS ESTREITAS aspecto roseta.\nmanganes=PONTUACOES cloroticas folhas novas.\nestresse_hidrico=folha MURCHA bordas secas enroladas.\n\n"+
"SE A IMAGEM MOSTRAR FRUTOS DE CAFE:\nfruto_verde=fruto totalmente verde firme sem lesoes.\nfruto_maduro=fruto VERMELHO ou AMARELO cereja uniforme brilhante.\nfruto_passado=fruto ESCURECIDO enrugado seco mumificado.\nbroca=FURO CIRCULAR escuro 1-2mm no disco floral ou coroa.\nantracnose_fruto=lesoes AFUNDADAS CIRCULARES marrom-escuras a PRETAS na superficie do fruto.\nfusariose_fruto=fruto MUMIFICADO marrom-escuro SEM perfuracao de broca.\ncercosporiose_fruto=manchas CIRCULARES PEQUENAS cinza-esbranquicadas com halo amarelo.\nphoma_fruto=manchas NECROTICAS escuras irregulares nos frutos VERDES JOVENS.\nacaro_fruto=superficie do fruto BRONZEADA acinzentada opaca.\n\n"+
"PRODUTOS E DOSES:\nferrugem: Tebuconazol 200SC sistemico 0,75-1L/ha proporcao_por_litro:0.75 unidade_proporcao:mL intervalo:21. Oxicloreto Cobre 840WP protetor 2-2,5kg/ha proporcao_por_litro:2.5 unidade_proporcao:g intervalo:21.\ncercosporiose: Oxicloreto Cobre 840WP protetor 2-2,5kg/ha. Tebuconazol 200SC sistemico 0,75-1L/ha.\nhelmintosporiose: Tebuconazol 200SC sistemico 0,75-1L/ha intervalo:14. Tiofanato Metilico 700WP protetor 1-1,5kg/ha proporcao_por_litro:1.25 unidade_proporcao:g intervalo:14.\nantracnose: Azoxistrobina+Difenoconazol sistemico 0,3-0,4L/ha proporcao_por_litro:0.3 unidade_proporcao:mL intervalo:14.\nphoma: Tiofanato Metilico 700WP protetor 1-1,5kg/ha.\nbicho: Thiamethoxam 250WG inseticida 0,1-0,2kg/ha proporcao_por_litro:0.1 unidade_proporcao:g intervalo:30.\nacaro: Abamectina 18EC acaricida 0,5-0,75L/ha proporcao_por_litro:0.5 unidade_proporcao:mL intervalo:21.\nbroca: Clorpirifos 480EC inseticida 1,5-2L/ha proporcao_por_litro:1.75 unidade_proporcao:mL intervalo:30.\n\n"+
"INSTRUCOES FINAIS:\n1. Liste TODOS os problemas encontrados — sem limite.\n2. Ordene do mais grave para o menos grave.\n3. Manchas alaranjadas na face inferior = ferrugem OBRIGATORIAMENTE.\n4. Manchas grandes marrons com halos = helmintosporiose OBRIGATORIAMENTE.\n5. Deficiencias nutricionais: fungicidas:[].\n6. NUNCA retorne saudavel se houver qualquer sintoma visivel.\n\n"+
"RESPONDA SOMENTE JSON sem texto antes ou depois:\n"+
"{\"diagnosticos\":[{\"diagnostico\":\"nome_exato\",\"estagio\":1,\"confianca\":\"alta|media|baixa\",\"visto\":\"sinal visual observado\",\"acao\":\"o que fazer em linguagem simples\",\"fungicidas\":[{\"nome\":\"nome generico\",\"nome_comercial\":\"marca\",\"tipo\":\"protetor|sistemico|biologico|acaricida|inseticida\",\"dose_min\":0.75,\"dose_max\":1.0,\"unidade\":\"L|kg\",\"por\":\"hectare\",\"proporcao_por_litro\":0.05,\"unidade_proporcao\":\"L|g|mL\",\"intervalo_reaplicacao\":21,\"carencia_dias\":7}]}]}";
}

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
var usuariosMemoria = {};

initDB().then(function() {
  app.listen(process.env.PORT||8080, function() {
    console.log("🌿 Doutor Cafe API ok — porta", process.env.PORT||8080);
    console.log("   DB:", pool?"PostgreSQL":"memória");
  });
});
