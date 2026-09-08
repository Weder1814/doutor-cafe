// Testa as travas de solo sem subir o servidor: extrai as funcoes do arquivo
// e roda so a matematica. Nao e codigo de producao — nada importa este arquivo.
// Rodar antes de cada push que mexa em solo, prompt de laudo ou tabela de
// adubacao:   node teste-solo.js
var fs = require("fs");
var path = require("path");

// Procura o arquivo do servidor na raiz do projeto e na pasta acima (caso este
// teste esteja em /testes). Se voce renomear o servidor, acrescente o nome aqui.
var CANDIDATOS = ["server_10.js", "server_9.js", "server.js", "index.js"];
var src = null, arquivoUsado = null;
[__dirname, path.join(__dirname, "..")].forEach(function(dir){
  if (src) return;
  CANDIDATOS.forEach(function(nome){
    if (src) return;
    var alvo = path.join(dir, nome);
    if (fs.existsSync(alvo)) { src = fs.readFileSync(alvo, "utf8"); arquivoUsado = alvo; }
  });
});
if (!src) {
  console.error("Nao encontrei o arquivo do servidor. Procurei por: " + CANDIDATOS.join(", "));
  console.error("Coloque este teste na mesma pasta do servidor, ou edite CANDIDATOS acima.");
  process.exit(1);
}
console.log("Testando: " + arquivoUsado);

function extrair(nome) {
  var i = src.indexOf("function " + nome + "(");
  if (i < 0) throw new Error("nao achei " + nome);
  var chaves = 0, j = src.indexOf("{", i), k = j;
  do {
    if (src[k] === "{") chaves++;
    else if (src[k] === "}") chaves--;
    k++;
  } while (chaves > 0 && k < src.length);
  return src.slice(i, k);
}

var PRNT_PADRAO = 80;
eval(extrair("normalizarUnidadesLaudo"));
eval(extrair("resolverKmgdm3"));
eval(extrair("calcularCalagemGessagem"));
eval(extrair("classificarPorFaixa"));
eval(extrair("buscarDoseTabela"));
eval(extrair("calcularAdubacaoNPK"));
eval(src.slice(src.indexOf("var TABELA_N ="), src.indexOf("function classificarPorFaixa")));

var falhas = 0;
function ok(cond, msg) {
  console.log((cond ? "  PASSOU  " : "  FALHOU  ") + msg);
  if (!cond) falhas++;
}

console.log("\n== 1. Laudo MG em cmolc/dm3 (caso normal, nao pode mudar nada) ==");
var mg = { ca_cmolc: 1.8, mg_cmolc: 0.6, k_cmolc: 0.15, al_cmolc: 0.4, t_cmolc: 6.2, ctc_efetiva_cmolc: 3.0, argila_pct: 42 };
var n1 = normalizarUnidadesLaudo(mg);
ok(n1.avisos.length === 0, "nenhum aviso de conversao");
ok(n1.vc.t_cmolc === 6.2, "T preservado em 6,2");
var c1 = calcularCalagemGessagem(n1.vc);
console.log("  dose:", c1.dose_recomendada_t_ha, "t/ha  metodo:", c1.metodo);
ok(c1.dose_recomendada_t_ha > 0.5 && c1.dose_recomendada_t_ha < 4, "dose na faixa agronomica");

console.log("\n== 2. MESMO solo, laudo padrao IAC/SP em mmolc/dm3 (10x) ==");
var sp = { ca_cmolc: 18, mg_cmolc: 6, k_cmolc: 1.5, al_cmolc: 4, t_cmolc: 62, ctc_efetiva_cmolc: 30, argila_pct: 42 };
var n2 = normalizarUnidadesLaudo(sp);
ok(n2.avisos.length === 1, "avisou a conversao: " + n2.avisos[0]);
var c2 = calcularCalagemGessagem(n2.vc);
console.log("  dose:", c2.dose_recomendada_t_ha, "t/ha");
ok(Math.abs(c2.dose_recomendada_t_ha - c1.dose_recomendada_t_ha) < 0.15, "chega na MESMA dose do laudo em cmolc");

console.log("\n== 2b. O que acontecia ANTES do patch (sem normalizar) ==");
var antes = (60 / 100) * 62 - (18 + 6 + 1.5);
console.log("  necessidade sem a trava:", Math.round(antes * 100) / 100, "t/ha -> dose", Math.round(antes * (100 / 80) * 100) / 100, "t/ha");
ok(antes > 8, "confirmado: sem a trava sairia dose absurda, e sem erro nenhum no log");

console.log("\n== 3. Argila em g/kg ==");
var n3 = normalizarUnidadesLaudo({ ca_cmolc: 0.4, mg_cmolc: 0.2, al_cmolc: 1.2, argila_pct: 380 });
ok(n3.vc.argila_pct === 38, "380 g/kg virou 38%");

console.log("\n== 4. Laudo incoerente (colunas trocadas) ==");
var n4 = normalizarUnidadesLaudo({ ca_cmolc: 5, mg_cmolc: 3, k_cmolc: 0.5, t_cmolc: 4 });
var c4 = calcularCalagemGessagem(n4.vc);
ok(c4 && c4.implausivel === true, "bloqueado: " + (c4 && c4.motivo));

console.log("\n== 5. Potassio: a origem do erro de dose ==");
var kA = resolverKmgdm3({ k_cmolc: 0.20 }, { K: { valor: "0,20" } });
console.log("  K = 0,20 cmolc/dm3 ->", Math.round(kA.valor), "mg/dm3");
ok(kA.valor > 60 && kA.valor < 120, "classificado como MEDIO (correto)");
var npkNovo = calcularAdubacaoNPK(40, 12, kA.valor, 42);
var npkAntigo = calcularAdubacaoNPK(40, 12, 0.20, 42); // comportamento antigo: usava o 0,20 cru
console.log("  K2O com o patch:", npkNovo.potassio_k2o_kg_ha_ano, "kg/ha  |  K2O antes:", npkAntigo.potassio_k2o_kg_ha_ano, "kg/ha");
ok(npkAntigo.potassio_k2o_kg_ha_ano > npkNovo.potassio_k2o_kg_ha_ano, "o bug recomendava mais K2O do que o necessario");

console.log("\n== 6. Potassio com unidade ambigua ==");
var kB = resolverKmgdm3({}, { K: { valor: "8" } });
ok(isNaN(kB.valor) && kB.aviso, "nao chuta a dose; explica: " + (kB.aviso || "").slice(0, 60) + "...");
var npkB = calcularAdubacaoNPK(40, 12, kB.valor, 42);
ok(npkB.potassio_k2o_kg_ha_ano === null, "K2O fica em branco em vez de sair errado");

console.log("\n== 7. K ja em mg/dm3 no laudo ==");
var kC = resolverKmgdm3({ k_mg_dm3: 78 }, null);
ok(kC.valor === 78, "usa o valor direto quando a unidade veio explicita");

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM\n" : "\n" + falhas + " FALHA(S)\n");
process.exit(falhas ? 1 : 0);
