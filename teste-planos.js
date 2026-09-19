// Testa as regras comerciais sem subir o servidor: extrai as funcoes puras
// do arquivo e roda so a logica de plano/cota.
// Rodar antes de cada push que mexa em plano, cota, preco ou billing:
//   node teste-planos.js
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
if (!src) { console.error("Nao encontrei o servidor. Procurei: " + CANDIDATOS.join(", ")); process.exit(1); }
console.log("Testando: " + usado + "\n");

function trecho(ini, fim) { var i = src.indexOf(ini); return src.slice(i, src.indexOf(fim, i)); }

function bloco(nome) {
  var i = src.indexOf("function " + nome + "(");
  if (i < 0) throw new Error("nao achei a funcao " + nome);
  var n = 0, j = src.indexOf("{", i), k = j;
  do { if (src[k] === "{") n++; else if (src[k] === "}") n--; k++; } while (n > 0 && k < src.length);
  return src.slice(i, k);
}
var ANALISES_GRATIS = 10;
eval(src.slice(src.indexOf("var LIMITES = {"), src.indexOf("};", src.indexOf("var LIMITES = {")) + 2));
eval(src.slice(src.indexOf("var VIDEO_LIMITES"), src.indexOf("};", src.indexOf("var VIDEO_LIMITES")) + 2));
eval(bloco("mesAtual"));
eval(bloco("planoVigente"));
eval(bloco("analisesRestantes"));
eval(bloco("videosRestantes"));

var falhas = 0;
function ok(c, m) { console.log((c ? "  PASSOU  " : "  FALHOU  ") + m); if (!c) falhas++; }

function dias(n) { return new Date(Date.now() + n * 86400000).toISOString(); }

console.log("== 1. Assinante em dia recebe o que comprou ==");
var emDia = { plano: "premium", plano_expira_em: dias(20), analises_usadas: 100, mes_reset: mesAtual() };
ok(planoVigente(emDia) === "premium", "plano vigente = premium");
ok(analisesRestantes(emDia) === 400, "restam 400 de 500 (usou 100)");
ok(videosRestantes(emDia) === 50, "50 videos do premium");

console.log("\n== 2. Cancelou a renovacao mas ainda tem dias pagos ==");
// Este era o caso quebrado: o tipo 3 do RTDN rebaixava na hora.
var cancelou = { plano: "basico", plano_expira_em: dias(18), analises_usadas: 10, mes_reset: mesAtual() };
ok(planoVigente(cancelou) === "basico", "continua basico ate a data de vencimento");
ok(analisesRestantes(cancelou) === 140, "mantem as 150 do mes (usou 10)");

console.log("\n== 3. Assinatura vencida de verdade ==");
var vencido = { plano: "premium", plano_expira_em: dias(-10), analises_usadas: 0, mes_reset: mesAtual() };
ok(planoVigente(vencido) === "gratuito", "cai para gratuito sozinho, sem depender de webhook");
ok(analisesRestantes(vencido) === 10, "volta ao limite gratuito (10)");
ok(videosRestantes(vencido) === 2, "volta ao limite gratuito de video (2)");

console.log("\n== 3b. O vazamento que existia antes ==");
// Sem a coluna de expiracao, o plano gravado valia para sempre.
var semColuna = { plano: "premium", analises_usadas: 0, mes_reset: mesAtual() };
ok(planoVigente(semColuna) === "premium", "conta antiga/manual sem data continua valendo (nao punimos quem ja tinha)");
console.log("     (era esse o buraco: SEM data, plano pago de 1 mes nunca terminava)");

console.log("\n== 4. Carencia de 3 dias (cartao falhou, Google ainda da prazo) ==");
var ontem = { plano: "pro", plano_expira_em: dias(-1), analises_usadas: 0, mes_reset: mesAtual() };
ok(planoVigente(ontem) === "pro", "1 dia vencido: mantem (nao derruba quem esta em dia)");
var quatro = { plano: "pro", plano_expira_em: dias(-4), analises_usadas: 0, mes_reset: mesAtual() };
ok(planoVigente(quatro) === "gratuito", "4 dias vencido: encerra");

console.log("\n== 5. Admin nao expira ==");
ok(planoVigente({ plano: "admin", plano_expira_em: dias(-999) }) === "admin", "conta admin nao e derrubada por data");

console.log("\n== 6. Reset mensal so vale para quem esta vigente ==");
var mesPassado = { plano: "premium", plano_expira_em: dias(-30), analises_usadas: 500, mes_reset: "2020-01" };
ok(analisesRestantes(mesPassado) === 0, "vencido nao ganha cota nova no virar do mes");
var vigenteMesNovo = { plano: "premium", plano_expira_em: dias(20), analises_usadas: 500, mes_reset: "2020-01" };
ok(analisesRestantes(vigenteMesNovo) === 500, "vigente ganha cota cheia no mes novo");

console.log("\n== 7. Coerencia dos limites com os planos vendidos ==");
ok(LIMITES.basico === 150 && LIMITES.pro === 300 && LIMITES.premium === 500, "150/300/500 batem com o anunciado");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM\n" : "\n" + falhas + " FALHA(S)\n");
process.exit(falhas ? 1 : 0);
