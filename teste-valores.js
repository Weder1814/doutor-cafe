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

// O index.html escreve acentos como entidade (&#234; = e-circunflexo). Para
// procurar por texto do jeito que o produtor LE na tela, decodificamos antes.
// Sem isso o teste procurava "mês" e o arquivo tinha "m&#234;s" — e acusava
// falta de um aviso que estava la.
var feTexto = fe.replace(/&#(\d+);/g, function(_, n){ return String.fromCharCode(+n); });

// Os comentarios do HTML CITAM o texto antigo de proposito, para quem ler
// entender o que foi tirado e por que. Toda checagem do tipo "nao promete
// mais X" roda sobre o HTML SEM comentarios — senao o teste acha a frase
// dentro do comentario que a explica e acusa falha falsa.
var feVisivel = feTexto.replace(/<!--[\s\S]*?-->/g, "");
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

console.log("\n== Video: nao anunciar o que o app nao tem ==");
// O botao de video esta desativado no app (bloco comentado na tela inicial).
// Enquanto estiver assim, o cartao de venda NAO pode prometer analise por
// video — seria a mesma promessa vazia que tiramos do "Relatorio mensal".
// Quando o video voltar, este teste inverte: passa a EXIGIR a linha no cartao
// e a conferir o numero contra VIDEO_LIMITES.
var videoNoApp = /id="btnVid"/.test(feVisivel);
if (videoNoApp) {
  [["basico", 10], ["pro", 25], ["premium", 50]].forEach(function (x) {
    ok(feTexto.indexOf("Até " + x[1] + " análises por vídeo/mês") > -1 && VIDEO_LIMITES[x[0]] === x[1],
      x[0] + ": cartao diz " + x[1] + " video e o servidor entrega " + VIDEO_LIMITES[x[0]]);
  });
} else {
  ok(!/análises por vídeo/.test(feVisivel),
    "video desligado no app: o cartao nao promete analise por video");
}

console.log("\n== Anual precisa valer a pena de verdade ==");
["basico", "pro", "premium"].forEach(function (t) {
  var economia = PRECOS[t].mensal * 12 - PRECOS[t].anual;
  ok(economia > 0, t + ": anual economiza R$" + economia.toFixed(2) + " no ano (tem que ser positivo)");
});

console.log("\n== Promessas que o app nao cumpre ==");
ok(feVisivel.indexOf("Relatório mensal da lavoura") === -1, 'nao promete "Relatório mensal da lavoura" (nao existe no produto)');
ok(feVisivel.indexOf("Histórico completo") === -1, 'nao promete "Histórico completo" (o historico e de 10 para todos os planos)');

console.log("\n== Condicoes da assinatura visiveis ANTES de pagar ==");
// Exigencia da politica de assinaturas do Google Play e do Codigo de Defesa
// do Consumidor: periodo, renovacao automatica e como cancelar precisam estar
// claros na hora da compra. Ate 20/09/2026 a tela de compra nao dizia nada
// disso — a unica frase "Cancele quando quiser" estava na landing, falando do
// plano GRATUITO.
ok(/Renova sozinha todo mês/.test(feTexto), "diz que a assinatura renova sozinha");
ok(/cancelar/i.test(fe) && fe.indexOf("termos-onde") > -1, "diz como e onde cancelar");
ok(/continua usando até o fim do mês que já pagou/.test(feTexto),
  "avisa que o acesso vale ate o fim do periodo pago (bate com a regra do servidor)");
ok(/PIX é diferente/.test(feTexto) && /não renova sozinho/.test(feTexto),
  "separa o PIX (pagamento unico) da assinatura recorrente");

console.log("\n== Plano anual: fora da tela, inteiro no servidor ==");
// Retirado da oferta em 20/09/2026, mas NAO apagado: o servidor continua
// pronto para o dia em que ele voltar. Se um dos dois lados mudar sozinho,
// este teste avisa.
var htmlSemComentario = fe.replace(/<!--[\s\S]*?-->/g, "");
ok(htmlSemComentario.indexOf('onclick="setCiclo(\'anual\')"') === -1,
  "o botao Anual nao esta sendo oferecido na tela");
ok(!!PLANOS["basico_anual"] && !!PLANOS["pro_anual"] && !!PLANOS["premium_anual"],
  "o servidor continua com os tres planos anuais cadastrados (prontos para voltar)");

console.log("\n== Cartao no site: desligado ate ser provado ==");
// Decisao de 20/09/2026: o caminho do cartao no site continua no codigo, mas
// so e oferecido depois de uma compra real confirmar que o plano ativa. Este
// teste garante que ninguem religue sem querer — e que o produtor que cair no
// site saiba para onde ir enquanto isso.
ok(/CARTAO_SITE_ATIVO/.test(srv), "servidor tem a chave CARTAO_SITE_ATIVO");
ok(/var CARTAO_SITE_LIBERADO = false/.test(fe),
  "o app comeca assumindo DESLIGADO (se o /ping falhar, nao oferece)");
ok(/cartaoDesligado/.test(srv),
  "o servidor recusa /assinar-site enquanto a chave estiver desligada (nao so o botao some)");
ok(/aviso-cartao-off/.test(fe) && /Prefere cart/.test(feTexto),
  "com o cartao escondido, o site aponta o produtor para o app");
ok(/cartao=teste|modoTesteCartao/.test(fe),
  "existe um modo de teste por endereco, para validar sem expor a todos");

console.log("\n== Espera honesta quando falta internet ==");
// Caso real de 23/09/2026: teste em campo sem internet. O app ficou mais de
// 25 segundos rodando, mostrando "Enviando foto ✓" e mais dois vistos verdes
// de etapas que nunca aconteceram. Duas causas: navigator.onLine diz apenas
// que EXISTE interface de rede (no iPhone, com barras e sem dados, ele
// devolve true), e o fetch do fluxo principal nao tinha timeout nenhum.
ok(/function sondarConexao/.test(fe),
  "existe sonda de conexao real (nao confia so no navigator.onLine)");
ok(/function confirmarEnvioSpinner/.test(fe),
  "o visto verde de 'Enviando foto' depende do servidor responder");
var proc = fe.slice(fe.indexOf("function processar(file, isVideo)"),
                    fe.indexOf("function processar(file, isVideo)") + 14000);
ok(/sondarConexao\(/.test(proc), "o fluxo da foto sonda a conexao antes de subir");
ok(/abortDiag/.test(proc) && /relogioPrimeiroByte/.test(proc),
  "o fetch do diagnostico tem tempo limite de primeiro byte (antes nao tinha nenhum)");
ok(/sondarConexao\(function\(temRede\)\{[\s\S]{0,200}reject\(erroOriginal\)/.test(fe.replace(/\s+/g," ").replace(/ /g,"")) ||
   /nao insiste/.test(fe),
  "a segunda tentativa so acontece se houver rede (evita esperar o dobro)");

console.log("\n== Politica de pagamento do Google Play ==");
ok(fe.indexOf("ajustarBotoesPagamento") > -1, "existe a funcao que esconde pagamento alternativo dentro do app");
ok(/function abrirPix\([^)]*\)\s*\{\s*(\/\/[^\n]*\n\s*)*if \(playBillingDisponivel\(\)\)/.test(fe),
  "abrirPix se recusa a abrir dentro do app Android");

console.log(falhas === 0 ? "\nTODOS OS VALORES BATEM\n" : "\n" + falhas + " DIVERGENCIA(S)\n");
process.exit(falhas ? 1 : 0);
