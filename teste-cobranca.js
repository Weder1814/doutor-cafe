// Prova que os vazamentos de cota estao fechados. Nenhum dos tres aparecia
// em log nenhum: do ponto de vista do codigo, tudo acontecia normalmente.
// Rodar antes de cada push que mexa em plano, cota, billing ou analise:
//   node teste-cobranca.js
var fs = require("fs");
var path = require("path");

var CANDIDATOS = ["server_10.js", "server.js", "index.js"];
var src = null, usado = null;
[__dirname, path.join(__dirname, "..")].forEach(function (dir) {
  if (src) return;
  CANDIDATOS.forEach(function (n) {
    if (src) return;
    var alvo = path.join(dir, n);
    if (fs.existsSync(alvo)) { src = fs.readFileSync(alvo, "utf8"); usado = alvo; }
  });
});
if (!src) { console.error("Nao encontrei o servidor."); process.exit(1); }
console.log("Testando: " + usado + "\n");

var falhas = 0;
function ok(c, m) { console.log((c ? "  PASSOU  " : "  FALHOU  ") + m); if (!c) falhas++; }

// Os comentarios do servidor CITAM o codigo antigo, de proposito, para quem
// ler entender o que era o bug. Se o teste procurasse no arquivo cru, acharia
// o codigo errado dentro do comentario que o explica e acusaria falha falsa.
// Por isso tudo que verifica "isto nao existe mais" roda sobre o codigo sem
// comentarios.
function semComentarios(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
var srcLimpo = semComentarios(src);

// ── 1. O SERVIDOR DEBITA A COTA, NAO O CLIENTE ───────────────────
console.log("== 1. Quem debita a cota ==");
// O furo: /diagnostico conferia a cota mas nao debitava. Quem debitava era o
// app. Bastava nao chamar /incrementar-analise para ter analises infinitas.
ok(/async function debitarAnalise\(/.test(src), "existe o debito no servidor (debitarAnalise)");

function corpoEndpoint(nome) {
  var re = new RegExp('app\\.post\\("' + nome.replace(/[/]/g, "\\/") + '"');
  var i = src.search(re);
  if (i < 0) return null;
  var prox = src.slice(i + 10).search(/app\.(post|get)\("/);
  return prox < 0 ? src.slice(i) : src.slice(i, i + 10 + prox);
}
["/diagnostico", "/diagnostico-json", "/diagnostico-video", "/analise-solo",
 "/identifica-daninha", "/identifica-defeito-grao"].forEach(function (e) {
  var c = corpoEndpoint(e);
  ok(!!c && c.indexOf("debitarAnalise(") > -1, e + " debita a cota no servidor");
});

// E o endpoint antigo NAO pode debitar tambem, senao quem esta com o app
// velho preso no cache gasta duas analises por foto.
var inc = corpoEndpoint("/incrementar-analise");
ok(!!inc && inc.indexOf("dbIncrementarAnalise(") === -1,
  "/incrementar-analise nao debita mais (evita cobrar em dobro do app antigo)");
var incV = corpoEndpoint("/incrementar-video");
ok(!!incV && incV.indexOf("dbIncrementarVideo(") === -1,
  "/incrementar-video nao debita mais");
var salvar = corpoEndpoint("/salvar-analise");
ok(!!salvar && salvar.indexOf("dbIncrementarAnalise(") === -1,
  "/salvar-analise nao debita (guardar no historico nao e consumo novo)");

// A regra que amarra tudo: UM unico lugar no servidor debita. Se aparecer
// outro, alguem vai gastar duas analises por foto e so o produtor vai notar.
// "await dbIncrementar..." conta so as CHAMADAS; a declaracao da funcao
// (async function dbIncrementarAnalise(userId)) nao entra.
var chamadas = (srcLimpo.match(/await dbIncrementarAnalise\(/g) || []).length;
ok(chamadas === 1, "existe exatamente UM ponto de debito no servidor (achei " + chamadas + ")");

// ── 2. ABRIR O APP NAO PODE ZERAR A COTA ─────────────────────────
console.log("\n== 2. Ativacao repetida nao devolve cota ==");
// O furo: dbAtualizarPlano zerava analises_usadas em toda chamada, e a
// reconciliacao roda a cada abertura do app. Assinante fechava e abria o app
// e tinha a cota cheia de novo — plano pago virava ilimitado sozinho.
var dbAtu = src.slice(src.indexOf("async function dbAtualizarPlano"),
                      src.indexOf("async function dbAtualizarPlano") + 2600);
ok(/var zerar/.test(dbAtu), "a funcao decide se zera, em vez de zerar sempre");
ok(/analises_usadas=0/.test(dbAtu) && /UPDATE usuarios SET plano=\$2, plano_id=\$3, mes_reset/.test(dbAtu),
  "existem os DOIS caminhos: com e sem zerar");
ok(/periodoNovo/.test(dbAtu), "so zera quando o periodo de cobranca avanca");
ok(/zerar = false/.test(dbAtu), "em caso de duvida, NAO zera (errar para o lado barato)");

// ── 3. UMA ASSINATURA, UMA CONTA POR VEZ ─────────────────────────
console.log("\n== 3. Assinatura nao vale em varias contas ==");
// O furo: nada ligava o purchaseToken a um userId, entao o mesmo token
// ativava quantas contas quisesse.
var proc = src.slice(src.indexOf("async function processarCompraPlay"),
                     src.indexOf("async function processarCompraPlay") + 4200);
ok(/donoAntigo/.test(proc), "verifica se o token ja pertence a outra conta");
ok(/plano='gratuito'/.test(proc), "tira o plano da conta anterior (transfere, nao duplica)");
ok(/DO UPDATE SET user_id=EXCLUDED.user_id/.test(src),
  "o registro do pagamento passa a apontar para o dono atual (renovacao vai para a conta certa)");

// ── 4. O QUE NAO PODE VOLTAR ─────────────────────────────────────
console.log("\n== 4. Regressoes que nao podem voltar ==");
ok(/tipoNotif===12 \|\| tipoNotif===13/.test(src),
  "so expiracao (13) e revogacao (12) derrubam o plano — cancelar nao tira dia pago");
ok(!/tipoNotif===3 \|\| tipoNotif===12/.test(src),
  "o tipo 3 (cancelou a renovacao) nao esta junto dos que derrubam");
ok(/function planoVigente/.test(src), "plano vencido vira gratuito sozinho, sem depender de webhook");
ok(/checkCobrancaRate/.test(src), "endpoints de cobranca tem limite de cadencia");

// ── 5. ANALISAR SEM CONTA ────────────────────────────────────────
console.log("\n== 5. Nao da para analisar sem conta ==");
// O furo: userId e "anonimo" por padrao quando o campo nao vem no corpo, e
// bloquearSeSemAnalises liberava "anonimo". Chamar a API sem userId dava
// analises ilimitadas, sem cadastro e sem limite.
var bloq = semComentarios(src.slice(src.indexOf("async function bloquearSeSemAnalises"),
                     src.indexOf("async function bloquearSeSemAnalises") + 2600));
ok(/userId === "anonimo"[\s\S]{0,400}status:401/.test(bloq),
  "sem userId (anonimo) o servidor exige cadastro, nao libera");
ok(srcLimpo.indexOf('if (userId !== "anonimo") {') === -1,
  "nenhum endpoint pula mais a checagem de cota para anonimo");

// ── 6. VIDEO: VARIAVEL QUE NAO EXISTIA ───────────────────────────
console.log("\n== 6. Analise por video responde ==");
// O furo: /diagnostico-video lia a variavel u, que nunca foi declarada.
// ReferenceError num handler async sem try/catch = requisicao sem resposta.
// Video estava quebrado para todo usuario cadastrado.
var vid = semComentarios(corpoEndpoint("/diagnostico-video") || "");
ok(vid.indexOf("if (u &&") === -1, "nao le mais a variavel inexistente 'u'");
ok(/var uVideo = await dbGetUser/.test(vid), "carrega o usuario de verdade antes de checar o limite de video");

// ── 7. PAGAR ADIANTADO NAO PODE ENCURTAR ─────────────────────────
console.log("\n== 7. Pagamento novo soma ao que ja foi pago ==");
eval(src.slice(src.indexOf("function expiracaoMP"), src.indexOf("\n}", src.indexOf("function expiracaoMP")) + 2));
var primeiro = expiracaoMP("basico_mensal", null);
var segundo  = expiracaoMP("basico_mensal", primeiro);
ok(segundo.getTime() > primeiro.getTime(),
  "pagar de novo com plano ativo ESTENDE (antes recomecava de hoje e perdia os dias restantes)");
var vencido = expiracaoMP("basico_mensal", new Date(Date.now() - 30*86400000));
ok(Math.abs(vencido.getTime() - primeiro.getTime()) < 86400000,
  "com plano ja vencido, conta a partir de hoje");

// ── 8. PAGAMENTO QUE TRAVA TEM QUE SE RESOLVER ───────────────────
console.log("\n== 8. Pagamento travado no Mercado Pago ==");
// O Google Play tinha duas redes (RTDN + reconciliacao no boot). O Mercado
// Pago nao tinha nenhuma: webhook perdido = pagamento "pending" para sempre,
// sem avisar o produtor nem o Dinho.
ok(/async function reconciliarPendentesMP/.test(src),
  "existe varredura de pagamentos pendentes do Mercado Pago");
ok(/setInterval\(function\(\)\{ reconciliarPendentesMP/.test(src),
  "a varredura roda sozinha, sem depender de alguem lembrar");
ok(/origem='mp_assinatura'/.test(src),
  "a varredura so mexe em pagamento do Mercado Pago (nao confunde com token do Google)");
ok(/INTERVAL '3 minutes'/.test(src),
  "espera 3 min antes de agir, para nao brigar com o webhook que costuma chegar antes");
ok(/pendente\(s\) ha mais de 24h/.test(src),
  "grita no log quando um pendente passa de 24h (caso de atendimento humano)");
ok(/app.post\("\/conferir-meu-pagamento"/.test(src),
  "o produtor consegue pedir a conferencia sozinho, sem WhatsApp");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM\n" : "\n" + falhas + " FALHA(S)\n");
process.exit(falhas ? 1 : 0);
