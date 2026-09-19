// Confere se os valores mostrados no app batem com os valores que o servidor
// cobra e entrega. Foi exatamente esse tipo de divergencia que produziu o
// "10 analises em cima, libere 15 embaixo" — so que aqui o preco de um plano.
// Rodar antes de cada push que mexa em preco, plano ou limite:
//   node teste-valores.js
var fs = require("fs");
var path = require("path");

function achar(nomes) {
  for (var d of [__dirname, path.join(__dirname, "..")])
    for (var n of nomes) { var a = path.join(d, n); if (fs.existsSync(a)) return a; }
  return null;
}
var aSrv = achar(["server_10.js", "server.js", "index.js"]);
var aFe = achar(["index.html"]);
if (!aSrv) { console.error("Nao encontrei o servidor."); process.exit(1); }

// O app e o servidor vivem em REPOSITORIOS DIFERENTES (doutor-cafe-app e
// doutorcafe), entao o index.html pode nao estar aqui. Nesse caso o teste
// nao tem o que comparar — e isso NAO e uma divergencia de valor, entao nao
// derruba o deploy. Ele avisa e sai limpo.
// No GitHub Actions o index.html e baixado do site publicado antes de rodar
// (ver .github/workflows/testes.yml), entao la a comparacao acontece de fato.
if (!aFe) {
  console.log("PULADO: nao encontrei o index.html nesta pasta.");
  console.log("Este teste compara o app com o servidor, e eles estao em repositorios diferentes.");
  console.log("Para rodar na mao, baixe o index.html do site para esta pasta:");
  console.log("  curl -o index.html https://doutor-cafe-app.vercel.app/");
  process.exit(0);
}
console.log("Servidor: " + aSrv + "\nApp:      " + aFe + "\n");

var srv = fs.readFileSync(aSrv, "utf8"), fe = fs.readFileSync(aFe, "utf8");
function objeto(marca) {
  var i = srv.indexOf(marca);
  if (i < 0) throw new Error("nao achei " + marca);
  return srv.slice(i, srv.indexOf("};", i) + 2);
}
var ANALISES_GRATIS = 10; // valor padrao; o real vem da env no Railway
eval(objeto("var LIMITES = {"));
eval(objeto("var VIDEO_LIMITES"));
eval(objeto("var PLANOS = {"));
eval(fe.match(/var PRECOS = \{[\s\S]*?\n\};/)[0]);

var falhas = 0;
function ok(c, m) { console.log((c ? "  PASSOU  " : "  FALHOU  ") + m); if (!c) falhas++; }

console.log("== Limite de analises: cartao do app x servidor ==");
var m = fe.match(/var LIMITE_BASICO=(\d+),LIMITE_PRO=(\d+),LIMITE_PREMIUM=(\d+)/);
ok(+m[1] === LIMITES.basico, "basico: app " + m[1] + " = servidor " + LIMITES.basico);
ok(+m[2] === LIMITES.pro, "pro: app " + m[2] + " = servidor " + LIMITES.pro);
ok(+m[3] === LIMITES.premium, "premium: app " + m[3] + " = servidor " + LIMITES.premium);

console.log("\n== Texto do cartao x limite real ==");
[["basico", 150], ["pro", 300], ["premium", 500]].forEach(function (x) {
  ok(fe.indexOf(x[1] + " análises por mês") > -1 && LIMITES[x[0]] === x[1],
    x[0] + ': cartao anuncia "' + x[1] + ' análises por mês" e o servidor entrega ' + LIMITES[x[0]]);
});

console.log("\n== Preco exibido x preco do plano no servidor ==");
["basico", "pro", "premium"].forEach(function (t) {
  ok(PRECOS[t].mensal === PLANOS[t + "_mensal"].valor,
    t + " mensal: app R$" + PRECOS[t].mensal.toFixed(2) + " = servidor R$" + PLANOS[t + "_mensal"].valor.toFixed(2));
  ok(PRECOS[t].anual === PLANOS[t + "_anual"].valor,
    t + " anual: app R$" + PRECOS[t].anual.toFixed(2) + " = servidor R$" + PLANOS[t + "_anual"].valor.toFixed(2));
});

console.log("\n== Sublimite de video divulgado x entregue ==");
[["basico", 10], ["pro", 25], ["premium", 50]].forEach(function (x) {
  ok(fe.indexOf("Até " + x[1] + " análises por vídeo/mês") > -1 && VIDEO_LIMITES[x[0]] === x[1],
    x[0] + ": cartao diz " + x[1] + " e o servidor entrega " + VIDEO_LIMITES[x[0]]);
});

console.log("\n== Anual precisa valer a pena de verdade ==");
["basico", "pro", "premium"].forEach(function (t) {
  var economia = PRECOS[t].mensal * 12 - PRECOS[t].anual;
  ok(economia > 0, t + ": anual economiza R$" + economia.toFixed(2) + " no ano (tem que ser positivo)");
});

console.log("\n== Promessas que o app nao cumpre ==");
ok(fe.indexOf("Relatório mensal da lavoura") === -1, 'nao promete "Relatório mensal da lavoura" (nao existe no produto)');
ok(fe.indexOf("Histórico completo") === -1, 'nao promete "Histórico completo" (o historico e de 10 para todos os planos)');

console.log("\n== Politica de pagamento do Google Play ==");
ok(fe.indexOf("ajustarBotoesPagamento") > -1, "existe a funcao que esconde pagamento alternativo dentro do app");
ok(/function abrirPix\([^)]*\)\s*\{\s*(\/\/[^\n]*\n\s*)*if \(playBillingDisponivel\(\)\)/.test(fe),
  "abrirPix se recusa a abrir dentro do app Android");

console.log(falhas === 0 ? "\nTODOS OS VALORES BATEM\n" : "\n" + falhas + " DIVERGENCIA(S)\n");
process.exit(falhas ? 1 : 0);
