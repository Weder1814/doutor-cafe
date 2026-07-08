<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Doutor Café</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2d8a3e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Doutor Café">
<link rel="apple-touch-icon" href="/icon-192.png">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --verde: #1a5c2a;
  --verde-claro: #2d8a3e;
  --verde-neon: #5dde74;
  --creme: #f5f0e8;
  --marrom: #3d2b1a;
  --cinza: #7a8a7c;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'DM Sans', sans-serif; background: var(--creme); min-height: 100vh; overflow-x: hidden; }

/* ── HEADER ── */
.header { width: 100%; position: relative; overflow: hidden; padding: max(28px, env(safe-area-inset-top)) 24px 40px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.header-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.header-overlay { position: absolute; inset: 0; background: linear-gradient(160deg, rgba(8,25,12,0.85) 0%, rgba(20,70,35,0.72) 50%, rgba(8,20,10,0.88) 100%); z-index: 1; }
.header-content { position: relative; z-index: 2; }
.logo-icon { font-size: 38px; display: block; margin-bottom: 6px; animation: float 3s ease-in-out infinite; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5)); }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.header h1 { font-family: 'Playfair Display', serif; font-size: 34px; color: white; letter-spacing: -0.5px; text-shadow: 0 2px 16px rgba(0,0,0,0.5); }
.header h1 span { color: var(--verde-neon); }
.header .sub { color: rgba(255,255,255,0.55); font-size: 12px; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }
.regiao-tag { display: inline-block; margin-top: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 14px; font-size: 12px; color: rgba(255,255,255,0.85); }
.contador-bar { margin-top: 10px; cursor: pointer; }
.contador-txt { font-size: 12px; color: rgba(255,255,255,0.85); display: block; margin-bottom: 5px; }
.contador-progresso { height: 5px; background: rgba(255,255,255,0.2); border-radius: 10px; overflow: hidden; }
.contador-fill { height: 100%; border-radius: 10px; background: var(--verde-neon); transition: width 0.4s; }
.contador-fill.amarelo { background: #ffd740; }
.contador-fill.vermelho { background: #ff5252; }
.wave { display: block; height: 36px; background: var(--creme); clip-path: ellipse(55% 100% at 50% 100%); margin-top: -1px; position: relative; z-index: 3; }
.corpo { max-width: 420px; margin: 0 auto; padding: 16px 20px 40px; display: flex; flex-direction: column; gap: 12px; }
.secao-titulo { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--cinza); padding: 4px 4px 0; }

/* ── CARDS DE SEÇÃO (identidade visual por tema) ────────────── */
.secao-card { border-radius: 20px; padding: 14px 14px 16px; margin-bottom: 4px; background: var(--tema-fundo); box-shadow: 0 2px 14px rgba(0,0,0,0.06); border: 3px solid var(--tema-borda); position: relative; overflow: hidden; }
.secao-card > * { position: relative; z-index: 1; }
.secao-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.secao-badge { width: 52px; height: 52px; border-radius: 15px; background: var(--tema-grad); display: flex; align-items: center; justify-content: center; font-size: 27px; flex-shrink: 0; box-shadow: 0 3px 10px var(--tema-sombra); }
.secao-card-tit { flex: 1; }
.secao-card-tit h3 { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; color: var(--tema-escuro); line-height: 1.15; }
.secao-card-tit p { font-size: 11.5px; color: var(--cinza); margin-top: 3px; line-height: 1.35; }

/* Folha do Café — Verde */
.tema-folha { --tema: #2d8a3e; --tema-escuro: #1a5c2a; --tema-grad: linear-gradient(135deg,#2d8a3e,#1a5c2a); --tema-sombra: rgba(26,92,42,0.3); --tema-bg: linear-gradient(180deg, rgba(45,138,62,0.05), rgba(45,138,62,0)); --tema-fundo: #f2f8f3; --tema-borda: #2d8a3e; }
/* Laudo de Solo — Marrom-terra */
.tema-solo { --tema: #795548; --tema-escuro: #4e342e; --tema-grad: linear-gradient(135deg,#8d6e63,#4e342e); --tema-sombra: rgba(78,52,46,0.3); --tema-bg: linear-gradient(180deg, rgba(121,85,72,0.05), rgba(121,85,72,0)); --tema-fundo: #f7f3f1; --tema-borda: #795548; }
/* Erva Daninha / Mato — Dourado-oliva (distinto dos dois verdes) */
.tema-mato { --tema: #c08a1e; --tema-escuro: #7a5a10; --tema-grad: linear-gradient(135deg,#d9a531,#a5730f); --tema-sombra: rgba(160,115,15,0.3); --tema-bg: linear-gradient(180deg, rgba(192,138,30,0.06), rgba(192,138,30,0)); --tema-fundo: #faf5e9; --tema-borda: #c08a1e; }
/* Botões da seção Mato passam a seguir o tema dourado-oliva (antes eram verdes, confundiam com folha) */
.tema-mato .btn-daninha { background: linear-gradient(135deg,#c99a2e,#a5730f); box-shadow: 0 4px 16px rgba(160,115,15,0.28); }
.tema-mato .btn-daninha-gal { color: #7a5a10; border-color: #e6d29a; }
.card-clima { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
.clima-topo { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; }
.clima-dados { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-top: 1px solid #f0f0f0; }
.clima-item { padding: 12px 14px; text-align: center; border-right: 1px solid #f0f0f0; }
.clima-item:last-child { border-right: none; }
.clima-valor { font-size: 20px; font-weight: 700; color: var(--marrom); }
.clima-label { font-size: 10px; color: var(--cinza); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
.risco-box { margin: 0 18px 14px; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
.risco-baixo { background: #e8f5e9; }
.risco-medio { background: #fff8e1; }
.risco-alto { background: #fff3e0; }
.risco-critico { background: #fce4ec; }
.risco-icon { font-size: 20px; flex-shrink: 0; }
.risco-info { flex: 1; }
.risco-titulo { font-size: 13px; font-weight: 700; }
.risco-baixo .risco-titulo { color: #2e7d32; }
.risco-medio .risco-titulo { color: #f57f17; }
.risco-alto .risco-titulo { color: #e65100; }
.risco-critico .risco-titulo { color: #c62828; }
.risco-desc { font-size: 11px; color: #666; margin-top: 2px; line-height: 1.4; }
.card-calendario { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
.cal-header { padding: 16px 18px 12px; display: flex; align-items: center; justify-content: space-between; }
.cal-mes { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--marrom); font-weight: 700; }
.cal-fase { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
.fase-florada { background: #fff8e1; color: #f57f17; }
.fase-granacao { background: #e8f5e9; color: #2e7d32; }
.fase-maturacao { background: #fff3e0; color: #e65100; }
.fase-colheita { background: #fce4ec; color: #c62828; }
.fase-pos { background: #e8eaf6; color: #283593; }
.fase-repouso { background: #f3e5f5; color: #6a1b9a; }
.cal-divisor { height: 1px; background: #f0f0f0; margin: 0 18px; }
.cal-alertas { padding: 12px 18px; }
.cal-alertas h4 { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--cinza); margin-bottom: 8px; }
.alerta-item { margin-bottom: 6px; }
.alerta-alto { color: #c62828; font-weight: 600; font-size: 13px; }
.alerta-medio { color: #e65100; font-weight: 600; font-size: 13px; }
.cal-acoes { padding: 0 18px 14px; }
.cal-acoes h4 { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--cinza); margin-bottom: 8px; }
.acao-item { font-size: 13px; color: #444; line-height: 1.4; margin-bottom: 5px; }
.btn-foto { background: linear-gradient(135deg, var(--verde-claro), var(--verde)); color: white; border: none; border-radius: 16px; padding: 18px 24px; font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 12px; width: 100%; box-shadow: 0 4px 16px rgba(26,92,42,0.25); transition: transform 0.15s; }
.btn-foto:active { transform: scale(0.97); }
.btn-video { background: linear-gradient(135deg, #1565c0, #0d47a1); color: white; border: none; border-radius: 16px; padding: 18px 24px; font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 12px; width: 100%; box-shadow: 0 4px 16px rgba(13,71,161,0.25); transition: transform 0.15s; }
.btn-video:active { transform: scale(0.97); }
.btn-video-wrap { position: relative; width: 100%; }

/* Espaçamento e hierarquia dos botões dentro dos cards de seção */
.secao-card .btn-foto { margin-top: 2px; padding: 22px 24px; box-shadow: 0 6px 22px rgba(26,92,42,0.38); position: relative; }
.secao-card .btn-foto::after { content: "\2605 Mais usado"; position: absolute; top: -10px; right: 14px; background: #ffd54f; color: #5a4500; font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.3px; box-shadow: 0 2px 6px rgba(0,0,0,0.18); }
.secao-card .btn-video-wrap { margin-top: 16px; }
.secao-card .btn-galeria { margin-top: 14px; }
.secao-card .solo-row { margin-top: 2px; }
.video-badge { display: flex; align-items: center; justify-content: space-between; background: #e8eaf6; border-radius: 0 0 12px 12px; padding: 5px 14px 6px; margin-top: -4px; font-size: 11px; font-weight: 700; color: #283593; }
.video-badge-bar { flex: 1; height: 4px; background: #c5cae9; border-radius: 2px; margin: 0 8px; overflow: hidden; }
.video-badge-fill { height: 100%; background: #3949ab; border-radius: 2px; transition: width 0.4s; }
.video-badge.esgotado { background: #fce4ec; color: #b71c1c; }
.video-badge.esgotado .video-badge-fill { background: #e53935; }
.plano-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.35); border-radius: 20px; padding: 4px 12px 4px 8px; font-size: 11px; font-weight: 700; color: white; cursor: pointer; margin-top: 6px; backdrop-filter: blur(4px); transition: background 0.2s; }
.plano-chip:active { background: rgba(255,255,255,0.28); }
.plano-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: #69f0ae; flex-shrink: 0; }
.plano-chip-dot.amarelo { background: #ffd740; }
.plano-chip-dot.vermelho { background: #ff5252; }
.btn-galeria { background: white; color: var(--verde); border: 2px solid #c8ddc8; border-radius: 16px; padding: 14px 24px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; transition: transform 0.15s; }
.btn-galeria:active { transform: scale(0.97); }
.solo-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.btn-solo { background: linear-gradient(135deg, #795548, #4e342e); color: white; border: none; border-radius: 16px; padding: 16px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; box-shadow: 0 4px 16px rgba(78,52,46,0.25); transition: transform 0.15s; }
.btn-solo:active { transform: scale(0.97); }
.btn-solo-gal { background: white; color: #4e342e; border: 2px solid #d7c4bb; border-radius: 16px; padding: 16px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; transition: transform 0.15s; }
.btn-solo-gal:active { transform: scale(0.97); }
.btn-daninha { background: linear-gradient(135deg, #558b2f, #33691e); color: white; border: none; border-radius: 16px; padding: 16px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; box-shadow: 0 4px 16px rgba(51,105,30,0.25); transition: transform 0.15s; }
.btn-daninha:active { transform: scale(0.97); }
.btn-daninha-gal { background: white; color: #33691e; border: 2px solid #c5e1a5; border-radius: 16px; padding: 16px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; transition: transform 0.15s; }
.btn-daninha-gal:active { transform: scale(0.97); }
.btn-icon { font-size: 22px; flex-shrink: 0; }
.btn-text { text-align: left; line-height: 1.3; }
.btn-text small { display: block; font-weight: 400; font-size: 11px; opacity: 0.7; margin-top: 2px; }
input[type="file"] { display: none; }
.dica { background: white; border-radius: 14px; padding: 12px 14px; display: flex; align-items: flex-start; gap: 10px; border-left: 3px solid var(--verde-neon); }
.dica p { font-size: 12px; color: var(--cinza); line-height: 1.5; }
.dica strong { color: var(--marrom); }
#spinner { display: none; background: white; border-radius: 20px; padding: 32px 20px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.07); }
.spinner-folha { font-size: 40px; animation: spin-pulse 1.2s ease-in-out infinite; display: block; margin-bottom: 12px; }
@keyframes spin-pulse { 0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; } 50% { transform: scale(1.15) rotate(10deg); opacity: 0.7; } }
#spinner p { color: var(--verde); font-weight: 700; font-size: 16px; }
#spinner small { color: var(--cinza); font-size: 12px; margin-top: 4px; display: block; }
#resultado { display: none; }
.card-resultado { background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); animation: slideUp 0.4s ease; }
.multi-header { padding: 16px 20px 8px; display: flex; align-items: center; gap: 12px; }
.multi-foto { width: 60px; height: 60px; border-radius: 12px; object-fit: cover; flex-shrink: 0; border: 2px solid #f0f0f0; }
.multi-foto-placeholder { width: 60px; height: 60px; border-radius: 12px; background: var(--creme); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.multi-titulo { flex: 1; }
.multi-titulo h3 { font-family: 'Playfair Display', serif; font-size: 16px; color: var(--marrom); }
.multi-titulo p { font-size: 11px; color: var(--cinza); margin-top: 2px; }
.diag-item { border-top: 1px solid #f0f0f0; padding: 14px 20px; }
.diag-item-topo { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.diag-nome { font-family: 'Playfair Display', serif; font-size: 17px; color: var(--marrom); text-transform: capitalize; font-weight: 700; }
.diag-cat { font-size: 10px; color: var(--cinza); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
.diag-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.diag-visto { background: var(--creme); border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #555; font-style: italic; line-height: 1.4; margin-bottom: 8px; }
.diag-acao { font-size: 13px; color: var(--marrom); line-height: 1.5; font-weight: 500; }
.diag-bar { display: flex; gap: 3px; margin-bottom: 8px; }
.diag-seg { flex: 1; height: 6px; border-radius: 3px; background: #e8e8e8; }
.calc-box { margin-top: 12px; background: #f0f7f0; border-radius: 14px; padding: 12px 14px; border: 1px solid #c8ddc8; }
.calc-titulo { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--verde); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.calc-produto { background: white; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid #e0ede0; }
.calc-produto-nome { font-size: 13px; font-weight: 700; color: var(--marrom); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.calc-tipo-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
.calc-tipo-protetor { background: #fff3e0; color: #e65100; }
.calc-tipo-sistemico { background: #e8eaf6; color: #283593; }
.calc-tipo-biologico { background: #e8f5e9; color: #2e7d32; }
.calc-tipo-acaricida { background: #fce4ec; color: #c62828; }
.calc-tipo-inseticida { background: #f3e5f5; color: #6a1b9a; }
.calc-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.calc-input-group { display: flex; flex-direction: column; gap: 3px; }
.calc-input-group label { font-size: 10px; color: var(--cinza); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.calc-input-group input { border: 1px solid #ddd; border-radius: 8px; padding: 7px 10px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: var(--marrom); background: white; width: 100%; }
.calc-input-group input:focus { outline: none; border-color: var(--verde-claro); }
.calc-resultado { background: var(--verde); border-radius: 10px; padding: 10px 12px; color: white; }
.calc-resultado-linha { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.calc-resultado-linha:last-child { margin-bottom: 0; }
.calc-resultado-label { font-size: 11px; opacity: 0.8; }
.calc-resultado-valor { font-size: 15px; font-weight: 700; }
.calc-aviso { font-size: 10px; opacity: 0.7; margin-top: 6px; font-style: italic; }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.card-topo { padding: 20px 20px 16px; display: flex; align-items: center; gap: 14px; }
.card-foto-thumb { width: 72px; height: 72px; border-radius: 14px; object-fit: cover; flex-shrink: 0; border: 2px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.card-foto-thumb-placeholder { width: 72px; height: 72px; border-radius: 14px; background: var(--creme); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.card-titulo h2 { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--marrom); text-transform: capitalize; }
.card-titulo .categoria { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--cinza); margin-top: 2px; }
.badges { padding: 0 20px 16px; display: flex; gap: 8px; flex-wrap: wrap; }
.badge { border-radius: 30px; padding: 5px 12px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.badge-estagio { background: #fff3e0; color: #e65100; }
.badge-confianca-alta { background: #e8f5e9; color: #2e7d32; }
.badge-confianca-media { background: #fff8e1; color: #f57f17; }
.badge-confianca-baixa { background: #fce4ec; color: #c62828; }
.aviso-confirmar { margin: 8px 0 4px; background: #fff8e1; border-radius: 10px; padding: 9px 12px; border-left: 3px solid #f5b800; font-size: 12px; color: #7a5c00; line-height: 1.5; }
.nav-inferior { position: fixed; bottom: 0; left: 0; right: 0; max-width: 480px; margin: 0 auto; background: #fff; border-top: 1px solid #ececec; display: flex; justify-content: space-around; align-items: center; padding: 6px 0 max(6px, env(safe-area-inset-bottom)); box-shadow: 0 -2px 12px rgba(0,0,0,0.06); z-index: 900; }
.nav-btn { flex: 1; background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 0; cursor: pointer; font-family: 'DM Sans', sans-serif; position: relative; }
.nav-btn-icon { font-size: 21px; line-height: 1; }
.nav-btn-label { font-size: 10px; font-weight: 600; color: #9a9a9a; }
.nav-btn.ativo .nav-btn-label { color: var(--verde); }
.nav-badge { position: absolute; top: 0; right: 22%; background: #e53935; color: #fff; font-size: 9px; font-weight: 700; min-width: 15px; height: 15px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; line-height: 1; }
.badge-regiao { background: #e3f2fd; color: #1565c0; }
.badge-video { background: #e8eaf6; color: #283593; }
.badge-solo { background: #efebe9; color: #4e342e; }
.badge-daninha { background: #f1f8e9; color: #33691e; }
.visto-box { margin: 0 20px 16px; background: var(--creme); border-radius: 12px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start; }
.visto-box .visto-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.visto-box p { font-size: 13px; color: #555; line-height: 1.5; font-style: italic; }
.divisor { height: 1px; background: #f0f0f0; margin: 0 20px; }
.acao-box { padding: 16px 20px; }
.acao-box h3 { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--cinza); margin-bottom: 8px; }
.acao-box p { font-size: 15px; color: var(--marrom); line-height: 1.6; font-weight: 500; }
.btns-resultado { padding: 12px 20px 20px; display: flex; gap: 8px; flex-wrap: wrap; }
.btn-voz { flex: 1; min-width: 80px; background: var(--verde); color: white; border: none; border-radius: 14px; padding: 13px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; }
.btn-nova { flex: 1; min-width: 80px; background: var(--creme); color: var(--verde); border: 2px solid #c8ddc8; border-radius: 14px; padding: 13px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; }
.btn-share { flex: 1; min-width: 80px; background: #25D366; color: white; border: none; border-radius: 14px; padding: 13px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; }
.solo-grid { padding: 0 20px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.solo-item { background: var(--creme); border-radius: 10px; padding: 10px 12px; }
.solo-item .solo-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--cinza); }
.solo-item .solo-valor { font-size: 16px; font-weight: 700; color: var(--marrom); margin-top: 2px; }
.solo-item .solo-status { font-size: 11px; margin-top: 2px; }
.solo-ok { color: #2e7d32; }
.solo-baixo { color: #c62828; }
.solo-alto { color: #e65100; }
.daninha-alerta { margin: 0 20px 14px; border-radius: 12px; padding: 12px 14px; }
.daninha-alerta-acido { background: #fff8e1; border-left: 4px solid #f57f17; }
.daninha-alerta-compactado { background: #fff3e0; border-left: 4px solid #e65100; }
.daninha-alerta-fertil { background: #e8f5e9; border-left: 4px solid #2e7d32; }
.daninha-alerta-umidade { background: #e3f2fd; border-left: 4px solid #1565c0; }
.daninha-alerta-degradado { background: #fce4ec; border-left: 4px solid #c62828; }
.daninha-alerta-mag { background: #f3e5f5; border-left: 4px solid #6a1b9a; }
.daninha-alerta-titulo { font-size: 13px; font-weight: 700; color: var(--marrom); margin-bottom: 4px; }
.daninha-alerta-desc { font-size: 12px; color: #555; line-height: 1.5; }
.card-historico { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
.hist-header { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; }
.hist-titulo { font-family: 'Playfair Display', serif; font-size: 16px; color: var(--marrom); font-weight: 700; }
.hist-limpar { font-size: 11px; color: var(--cinza); cursor: pointer; text-decoration: underline; background: none; border: none; font-family: 'DM Sans', sans-serif; }
.hist-lista { padding: 0 18px 14px; display: flex; flex-direction: column; gap: 8px; }
.hist-item { display: flex; align-items: center; gap: 10px; background: var(--creme); border-radius: 12px; padding: 10px 12px; }
.hist-thumb { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.hist-thumb-placeholder { width: 44px; height: 44px; border-radius: 10px; background: #e8e8e8; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.hist-info { flex: 1; }
.hist-nome { font-size: 13px; font-weight: 700; color: var(--marrom); text-transform: capitalize; }
.hist-data { font-size: 11px; color: var(--cinza); margin-top: 2px; }
.hist-vazio { padding: 16px 18px; font-size: 13px; color: var(--cinza); text-align: center; }
.card-fila { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 20px rgba(230,81,0,0.15); border: 2px solid #ffe0b2; }
.fila-header { padding: 14px 18px 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.fila-header-esq { flex: 1; }
.fila-titulo { font-family: 'Playfair Display', serif; font-size: 16px; color: var(--marrom); font-weight: 700; }
.fila-sub { font-size: 11px; color: #e65100; font-weight: 600; margin-top: 3px; display: flex; align-items: center; gap: 5px; }
.fila-contagem { display: inline-flex; align-items: center; justify-content: center; background: #e65100; color: white; border-radius: 20px; padding: 2px 9px; font-size: 11px; font-weight: 700; }
.fila-limpar { font-size: 11px; color: var(--cinza); cursor: pointer; text-decoration: underline; background: none; border: none; font-family: 'DM Sans', sans-serif; white-space: nowrap; padding-top: 2px; }
.fila-divisor { height: 1px; background: #ffe0b2; margin: 0 18px; }
.fila-grid { padding: 14px 18px 16px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
.fila-item { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 1; cursor: pointer; box-shadow: 0 3px 12px rgba(0,0,0,0.18); border: 2px solid #ffe0b2; transition: transform 0.15s, box-shadow 0.15s; background: #f5ebe0; }
.fila-item:active { transform: scale(0.96); box-shadow: 0 1px 6px rgba(0,0,0,0.12); }
.fila-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fila-item-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 45%, transparent 70%); display: flex; flex-direction: column; justify-content: flex-end; padding: 10px 10px 9px; gap: 2px; }
.fila-item-hora { font-size: 9px; color: rgba(255,255,255,0.85); font-weight: 600; line-height: 1.2; }
.fila-item-tap { font-size: 9px; color: #ffd54f; font-weight: 800; letter-spacing: 0.1px; }
.fila-item-num { position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,0.55); color: white; border-radius: 20px; padding: 1px 6px; font-size: 9px; font-weight: 700; }
.fila-item-del { position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; padding: 0; font-family: 'DM Sans', sans-serif; }
.offline-banner { margin: 0 18px 12px; background: #fff3e0; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
.offline-banner-icon { font-size: 20px; flex-shrink: 0; }
.offline-banner-txt { font-size: 12px; color: #bf360c; line-height: 1.4; font-weight: 500; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1000; align-items: flex-end; justify-content: center; }
.modal-overlay.ativo { display: flex; }
.modal-planos { background: var(--creme); border-radius: 28px 28px 0 0; padding: 62px 20px 48px; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; position: relative; }
.modal-titulo { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--marrom); font-weight: 900; margin-bottom: 4px; }
.modal-sub { font-size: 13px; color: var(--cinza); margin-bottom: 14px; line-height: 1.4; }
.modal-esgotado { background: #fce4ec; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #c62828; font-weight: 600; line-height: 1.4; }
.toggle-ciclo { display: flex; gap: 6px; background: white; border-radius: 14px; padding: 4px; margin-bottom: 16px; }
.toggle-btn { flex: 1; border: none; border-radius: 10px; padding: 9px 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--cinza); transition: all 0.2s; }
.toggle-btn.ativo { background: var(--verde); color: white; }
.toggle-economia { background: #e8f5e9; color: #2e7d32; border-radius: 20px; padding: 2px 7px; font-size: 10px; font-weight: 700; margin-left: 4px; display: inline-block; }
.plano-card { background: white; border-radius: 20px; padding: 18px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); position: relative; }
.plano-card.destaque { border: 2px solid var(--verde-claro); box-shadow: 0 4px 20px rgba(45,138,62,0.2); }
.plano-badge { font-size: 11px; font-weight: 700; color: var(--verde); background: #e8f5e9; border-radius: 20px; padding: 3px 10px; display: inline-block; margin-bottom: 8px; }
.plano-nome { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--marrom); font-weight: 700; margin-bottom: 4px; }
.plano-preco { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
.plano-valor { font-size: 28px; font-weight: 900; color: var(--verde); }
.plano-periodo { font-size: 13px; color: var(--cinza); }
.plano-anual-desc { font-size: 11px; color: #2e7d32; background: #e8f5e9; border-radius: 8px; padding: 4px 10px; margin-bottom: 10px; display: inline-block; }
.plano-features { list-style: none; margin: 12px 0 16px; display: flex; flex-direction: column; gap: 7px; }
.plano-features li { font-size: 13px; color: #444; padding-left: 20px; position: relative; line-height: 1.4; }
.plano-features li::before { content: "\2713"; position: absolute; left: 0; color: var(--verde-claro); font-weight: 700; }
.btn-assinar { width: 100%; padding: 13px; background: linear-gradient(135deg, var(--verde-claro), var(--verde)); color: white; border: none; border-radius: 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; margin-bottom: 6px; transition: opacity 0.15s; }
.btn-assinar:active { opacity: 0.85; }
.btn-fechar-modal { width: 100%; padding: 14px; background: transparent; color: var(--cinza); border: none; font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer; margin-top: 6px; text-decoration: underline; }
.btn-pix-plano { width:100%; padding:12px; background:white; color:var(--verde); border:2px solid #c8ddc8; border-radius:14px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:6px; }
.modal-pix { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1100; align-items:center; justify-content:center; padding:20px; }
.modal-pix.ativo { display:flex; }
.modal-pix-box { background:white; border-radius:24px; padding:24px 20px; width:100%; max-width:360px; text-align:center; max-height:90vh; overflow-y:auto; }
.modal-pix-titulo { font-family:'Playfair Display',serif; font-size:20px; color:var(--marrom); margin-bottom:4px; }
.modal-pix-sub { font-size:13px; color:var(--cinza); margin-bottom:16px; line-height:1.4; }
.pix-loading { display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; color:var(--cinza); padding:20px 0; }
.pix-spinner { width:20px; height:20px; border:2px solid #e0e0e0; border-top-color:var(--verde); border-radius:50%; animation:pixspin 1s linear infinite; flex-shrink:0; }
@keyframes pixspin { to { transform:rotate(360deg); } }
.pix-form-label { font-size:11px; font-weight:700; color:var(--cinza); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:4px; text-align:left; }
.pix-form-input { width:100%; border:1.5px solid #ddd; border-radius:10px; padding:10px 12px; font-size:14px; font-family:'DM Sans',sans-serif; color:var(--marrom); outline:none; margin-bottom:12px; display:block; }
.pix-status { padding:12px; border-radius:12px; margin-bottom:12px; font-size:13px; font-weight:600; text-align:center; }
.pix-status-aguardando { background:#fff8e1; color:#f57f17; }
.pix-status-aprovado { background:#e8f5e9; color:#2e7d32; }
.pix-status-erro { background:#fce4ec; color:#c62828; }
.pix-qr-img { width:200px; height:200px; margin:0 auto 14px; border-radius:12px; overflow:hidden; border:3px solid #f0f0f0; }
.pix-qr-img img { width:100%; height:100%; object-fit:contain; }
.pix-codigo-box { background:#f5f0e8; border-radius:10px; padding:10px 12px; margin-bottom:12px; text-align:left; }
.pix-codigo-label { font-size:10px; color:var(--cinza); font-weight:600; margin-bottom:4px; }
.pix-codigo-txt { font-size:10px; color:var(--marrom); word-break:break-all; font-family:monospace; line-height:1.4; }
.btn-copiar-pix { width:100%; padding:11px; background:var(--verde); color:white; border:none; border-radius:12px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:700; cursor:pointer; margin-bottom:8px; }
.btn-fechar-pix { width:100%; padding:11px; background:white; color:var(--cinza); border:2px solid #e8e8e8; border-radius:12px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; cursor:pointer; }
.continuar-gratis-box { background: linear-gradient(135deg,#e8f5e9,#f1f8e9); border: 2px solid #2d8a3e; border-radius: 16px; padding: 16px 20px; margin: 16px 20px; text-align: center; }
.continuar-gratis-txt { font-size: 13px; color: #2d8a3e; margin-bottom: 10px; }
.btn-continuar-gratis { background: linear-gradient(135deg,#2d8a3e,#1a5c2a); color: white; border: none; border-radius: 12px; padding: 12px 24px; font-size: 15px; font-weight: 700; cursor: pointer; width: 100%; }
.talhoes-section { margin: 24px 16px 0; }
.talhoes-titulo { font-size: 11px; font-weight: 700; color: var(--verde-escuro); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.talhoes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.talhao-card { background: white; border-radius: 16px; padding: 14px; border: 1.5px solid #e0ede0; cursor: pointer; transition: all 0.2s; }
.talhao-card:active { transform: scale(0.97); }
.talhao-card.alerta { border-color: #ef6c00; background: #fff8f3; }
.talhao-nome { font-size: 15px; font-weight: 700; color: var(--verde-escuro); margin-bottom: 2px; }
.talhao-var { font-size: 11px; color: #888; margin-bottom: 8px; }
.talhao-ultima { font-size: 11px; color: #555; }
.talhao-status { display: inline-block; font-size: 10px; font-weight: 700; border-radius: 8px; padding: 2px 8px; margin-top: 6px; }
.talhao-status.pendente { background: #fff3e0; color: #e65100; }
.talhao-status.ok { background: #e8f5e9; color: #2e7d32; }
.btn-novo-talhao { width: 100%; margin-top: 10px; padding: 12px; background: transparent; border: 2px dashed #2d8a3e; border-radius: 16px; color: #2d8a3e; font-size: 14px; font-weight: 700; cursor: pointer; }
.modal-talhao-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 1000; align-items: flex-end; }
.modal-talhao-overlay.ativo { display: flex; }
.modal-talhao-box { background: white; border-radius: 24px 24px 0 0; padding: 20px 16px 90px; width: 100%; max-height: 80vh; overflow-y: auto; }
.modal-talhao-titulo { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: var(--verde-escuro); margin-bottom: 4px; }
.modal-talhao-sub { font-size: 13px; color: #888; margin-bottom: 16px; }
.talhao-opcao { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 14px; border: 1.5px solid #e0ede0; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
.talhao-opcao:active { background: #e8f5e9; border-color: #2d8a3e; }
.talhao-opcao-nome { font-size: 15px; font-weight: 700; color: #1a1a1a; }
.talhao-opcao-detalhe { font-size: 12px; color: #888; }
.talhao-opcao-icone { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg,#2d8a3e,#1a5c2a); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.btn-criar-talhao-modal { width: 100%; padding: 14px; background: linear-gradient(135deg,#2d8a3e,#1a5c2a); color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 8px; }
.modal-criar-talhao { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 1000; align-items: flex-end; }
.modal-criar-talhao.ativo { display: flex; }
.criar-talhao-box { background: white; border-radius: 24px 24px 0 0; padding: 24px 16px 32px; width: 100%; }
.criar-talhao-titulo { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: var(--verde-escuro); margin-bottom: 16px; }
.criar-talhao-label { font-size: 12px; font-weight: 700; color: #555; margin-bottom: 4px; margin-top: 12px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
.criar-talhao-input { width: 100%; padding: 12px 14px; border: 1.5px solid #ddd; border-radius: 12px; font-size: 15px; box-sizing: border-box; }
.criar-talhao-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.criar-talhao-select { width: 100%; padding: 12px 14px; border: 1.5px solid #ddd; border-radius: 12px; font-size: 14px; background: white; box-sizing: border-box; }
.btn-salvar-talhao { width: 100%; padding: 14px; background: linear-gradient(135deg,#2d8a3e,#1a5c2a); color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 16px; }
.btn-cancelar-talhao { width: 100%; padding: 12px; background: transparent; border: none; color: #888; font-size: 14px; cursor: pointer; margin-top: 8px; }
.modal-hist-talhao { display: none; position: fixed; inset: 0; background: white; z-index: 1000; overflow-y: auto; }
.modal-hist-talhao.ativo { display: block; }
.hist-talhao-header { background: linear-gradient(135deg,#1a5c2a,#2d8a3e); padding: 48px 20px 20px; }
.hist-talhao-back { font-size: 22px; cursor: pointer; color: white; margin-bottom: 8px; display: inline-block; }
.hist-talhao-nome { font-family: 'Playfair Display', serif; font-size: 26px; color: white; font-weight: 700; }
.hist-talhao-info { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px; }
.hist-analise-card { margin: 12px 16px; background: white; border-radius: 16px; border: 1.5px solid #e0ede0; overflow: hidden; }
.hist-analise-header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.hist-analise-foto { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.hist-analise-data { font-size: 12px; color: #888; }
.hist-analise-diags { font-size: 13px; font-weight: 600; color: #1a1a1a; margin-top: 2px; }
.hist-analise-status { padding: 8px 14px; border-top: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; }
.btn-status-talhao { font-size: 12px; font-weight: 700; border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.btn-status-pendente { background: #fff3e0; color: #e65100; }
.btn-status-ok { background: #e8f5e9; color: #2e7d32; }
.hist-analise-doenca { display: flex; align-items: flex-start; gap: 8px; padding: 8px 14px; border-top: 1px solid #f5f5f5; }
.hist-analise-doenca-emoji { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.hist-analise-doenca-nome { font-size: 13px; font-weight: 700; color: #3d2b1a; text-transform: capitalize; }
.hist-analise-doenca-estagio { display: inline-flex; gap: 2px; margin: 3px 0; }
.hist-analise-doenca-seg { width: 14px; height: 4px; border-radius: 2px; background: #e8e8e8; }
.hist-analise-doenca-acao { font-size: 12px; color: #555; line-height: 1.4; margin-top: 2px; }
canvas { display: none; }
.aviso-servidor { margin: 0 20px 12px; background: #fff3e0; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #bf360c; font-weight: 500; }
.disclaimer-legal { margin: 0 20px 14px; background: #f0f4f7; border-radius: 12px; padding: 10px 14px; border-left: 4px solid #6b8ca3; font-size: 11px; color: #666; line-height: 1.6; }
.ordem-mistura { margin: 10px 0 0; background: #e8f5e9; border-radius: 10px; padding: 10px 12px; font-size: 12px; color: #1a5c2a; line-height: 1.7; }
.modal-cad-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 1000; align-items: flex-end; justify-content: center; }
.modal-cad-overlay.ativo { display: flex; }
.daninha-produto { background: white; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; border: 1px solid #e0ede0; font-size: 12px; color: #555; }
.modal-cadastro { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.82); z-index:1200; align-items:center; justify-content:center; padding:20px; }
.modal-cadastro.ativo { display:flex; }
.modal-cadastro-box { background:white; border-radius:24px; padding:28px 22px 24px; width:100%; max-width:380px; text-align:center; }
.modal-cadastro-icon { font-size:44px; margin-bottom:8px; display:block; }
.modal-cadastro-titulo { font-family:'Playfair Display',serif; font-size:22px; color:var(--marrom); font-weight:900; margin-bottom:6px; }
.modal-cadastro-sub { font-size:13px; color:var(--cinza); margin-bottom:6px; line-height:1.5; }
.modal-cadastro-bonus { background:#e8f5e9; border-radius:12px; padding:10px 14px; margin-bottom:16px; font-size:13px; color:#2e7d32; font-weight:700; }
.cad-label { font-size:11px; font-weight:700; color:var(--cinza); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:4px; text-align:left; }
.cad-input { width:100%; border:1.5px solid #ddd; border-radius:10px; padding:11px 13px; font-size:15px; font-family:'DM Sans',sans-serif; color:var(--marrom); outline:none; margin-bottom:12px; display:block; }
.cad-input:focus { border-color:var(--verde-claro); }
.cad-select { width:100%; border:1.5px solid #ddd; border-radius:10px; padding:11px 13px; font-size:15px; font-family:'DM Sans',sans-serif; color:var(--marrom); outline:none; margin-bottom:12px; display:block; background:white; }
.cad-select:focus { border-color:var(--verde-claro); }
.btn-cadastrar { width:100%; padding:14px; background:linear-gradient(135deg,var(--verde-claro),var(--verde)); color:white; border:none; border-radius:14px; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:700; cursor:pointer; margin-top:4px; }
.btn-cadastrar:active { opacity:0.85; }
.cad-privacidade { font-size:10px; color:var(--cinza); margin-top:10px; line-height:1.4; }
.resumo-diag-card { background: linear-gradient(135deg, #1a5c2a, #2d7a3a); border-radius: 18px; padding: 18px; margin-bottom: 10px; color: white; }
.resumo-diag-secao { font-size: 13px; color: rgba(255,255,255,0.75); margin: 6px 0 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.resumo-diag-linha { font-size: 14px; color: white; padding: 3px 0; display: flex; align-items: center; gap: 6px; }
.resumo-diag-titulo { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.75); margin-bottom: 8px; }
.resumo-diag-texto { font-size: 15px; line-height: 1.6; color: white; font-weight: 500; }
.plano-acao-card { background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(26,92,42,0.15); border: 2px solid #2d8a3e; margin-bottom: 10px; }
.plano-acao-header { background: linear-gradient(135deg, #2d8a3e, #1a5c2a); padding: 14px 18px; }
.plano-acao-titulo { font-family: 'Playfair Display', serif; font-size: 17px; color: white; font-weight: 700; margin-bottom: 2px; }
.plano-acao-resumo { font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.4; }
.plano-acao-item { padding: 12px 18px; border-top: 1px solid #f0f0f0; display: flex; gap: 12px; align-items: flex-start; }
.plano-acao-icone { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
.plano-acao-label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #7a8a7c; margin-bottom: 4px; }
.plano-acao-texto { font-size: 14px; color: #3d2b1a; line-height: 1.5; font-weight: 500; }
.plano-acao-urgente { background: #fff8f8; }
.plano-acao-21dias { background: #f8fff8; }
.plano-acao-nutricao { background: #fffff8; }
#tela-landing { display:none; min-height:100vh; background: linear-gradient(160deg,#0a2e14 0%,#1a5c2a 50%,#2d8a3e 100%); position:relative; overflow:hidden; }
.landing-bg { position:absolute;inset:0;background:url('cafe.jpeg') center/cover no-repeat;opacity:0.18; }
.landing-content { position:relative;z-index:1;padding:0 0 40px; }
.landing-header { text-align:center;padding:48px 24px 28px; }
.landing-logo { font-size:52px;margin-bottom:8px; }
.landing-titulo { font-family:'Playfair Display',serif;font-size:36px;color:white;font-weight:700;margin:0;line-height:1.1; }
.landing-titulo span { color:#7dd98a; }
.landing-sub { color:rgba(255,255,255,0.82);font-size:15px;margin-top:8px;letter-spacing:0.5px;text-transform:uppercase; }
.landing-badge { display:inline-block;background:rgba(125,217,138,0.2);border:1px solid rgba(125,217,138,0.5);color:#7dd98a;font-size:12px;font-weight:600;padding:5px 14px;border-radius:20px;margin-top:10px; }
.landing-features { padding:0 20px;margin-bottom:28px; }
.landing-feat { display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 16px;margin-bottom:10px; }
.landing-feat-icon { font-size:28px;flex-shrink:0; }
.landing-feat-info h4 { color:white;font-size:15px;font-weight:700;margin:0 0 2px; }
.landing-feat-info p { color:rgba(255,255,255,0.68);font-size:12px;margin:0;line-height:1.4; }
.landing-steps { padding:0 20px;margin-bottom:28px; }
.landing-steps-title { color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px; }
.landing-steps-row { display:flex;gap:8px; }
.landing-step { flex:1;background:rgba(255,255,255,0.07);border-radius:12px;padding:12px 8px;text-align:center; }
.landing-step-num { width:26px;height:26px;background:#2d8a3e;border-radius:50%;color:white;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 6px; }
.landing-step p { color:rgba(255,255,255,0.75);font-size:11px;margin:0;line-height:1.3; }
.landing-cta { padding:0 20px;text-align:center; }
.btn-landing-cta { width:100%;padding:18px;background:linear-gradient(135deg,#4caf50,#2d8a3e);color:white;border:none;border-radius:16px;font-size:18px;font-weight:700;cursor:pointer;box-shadow:0 6px 24px rgba(45,138,62,0.5);letter-spacing:0.3px; }
.btn-landing-cta:active { transform:scale(0.98); }
.landing-nota { color:rgba(255,255,255,0.45);font-size:12px;margin-top:10px; }
.landing-social { padding:24px 20px 0;display:flex;justify-content:center;gap:20px; }
.landing-social-item { text-align:center;color:rgba(255,255,255,0.55);font-size:12px; }
.landing-social-item strong { display:block;color:#7dd98a;font-size:22px;font-weight:700; }
#tela-cadastro-inicial { display:none; min-height:100vh; background:#f5f7f5; }
.cad-inicial-header { background:linear-gradient(135deg,#1a5c2a,#2d8a3e);padding:28px 20px 36px;text-align:center; }
.cad-inicial-logo { font-size:36px;margin-bottom:4px; }
.cad-inicial-titulo { font-family:'Playfair Display',serif;font-size:22px;color:white;font-weight:700;margin:0; }
.cad-inicial-sub { color:rgba(255,255,255,0.75);font-size:13px;margin-top:6px; }
.cad-inicial-card { background:white;margin:-18px 16px 0;border-radius:20px;padding:24px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.1); }
.cad-inicial-card h3 { font-size:17px;color:#1a5c2a;font-weight:700;margin:0 0 4px; }
.cad-inicial-card p { font-size:13px;color:#666;margin:0 0 20px;line-height:1.5; }
.cad-field { margin-bottom:16px; }
.cad-field label { display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px; }
.cad-field input { width:100%;padding:13px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:15px;color:#222;box-sizing:border-box;outline:none;transition:border 0.2s; }
.cad-field input:focus { border-color:#2d8a3e; }
.cad-field .opcional { color:#999;font-weight:400;font-size:11px; }
.btn-cad-submit { width:100%;padding:16px;background:linear-gradient(135deg,#2d8a3e,#1a5c2a);color:white;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px;box-shadow:0 4px 16px rgba(45,138,62,0.35); }
.btn-cad-submit:active { transform:scale(0.98); }
.cad-voltar { display:block;text-align:center;color:#888;font-size:13px;margin-top:14px;cursor:pointer; }
.cad-beneficios { margin:16px 16px 0;display:flex;flex-direction:column;gap:8px; }
.cad-ben-item { display:flex;align-items:center;gap:10px;background:white;border-radius:12px;padding:11px 14px;box-shadow:0 1px 6px rgba(0,0,0,0.06); }
.cad-ben-item span:first-child { font-size:20px;flex-shrink:0; }
.cad-ben-item p { margin:0;font-size:13px;color:#333;font-weight:500; }
</style>
</head>
<body>

<!-- TELA 1: LANDING PAGE -->
<div id="tela-landing">
  <div class="landing-bg"></div>
  <div class="landing-content">
    <div class="landing-header">
      <div class="landing-logo">🌿</div>
      <h1 class="landing-titulo">Doutor <span>Café</span></h1>
      <div class="landing-sub">O agrônomo no seu bolso</div>
      <div class="landing-badge">✓ 15 análises grátis para começar</div>
    </div>
    <div class="landing-features">
      <div class="landing-feat"><div class="landing-feat-icon">🔬</div><div class="landing-feat-info"><h4>Diagnóstico por Foto ou Vídeo</h4><p>IA identifica ferrugem, cercosporiose, helmintosporiose e mais 30 doenças com alta precisão</p></div></div>
      <div class="landing-feat"><div class="landing-feat-icon">📋</div><div class="landing-feat-info"><h4>Plano de Ação com Dosagens</h4><p>Recebe o que fazer essa semana, em 21 dias e a dosagem exata por tanque de 20L</p></div></div>
      <div class="landing-feat"><div class="landing-feat-icon">🧪</div><div class="landing-feat-info"><h4>Análise de Solo e Daninhas</h4><p>Interpreta laudo de solo e identifica plantas daninhas indicadoras de problemas</p></div></div>
      <div class="landing-feat"><div class="landing-feat-icon">📍</div><div class="landing-feat-info"><h4>Adaptado a Todas as Regiões Cafeeiras</h4><p>Mogiana, Sul de Minas, Cerrado Mineiro, Matas de Minas, Chapada Diamantina, Rondônia, Espírito Santo e mais</p></div></div>
    </div>
    <div class="landing-steps">
      <div class="landing-steps-title">Como funciona</div>
      <div class="landing-steps-row">
        <div class="landing-step"><div class="landing-step-num">1</div><p>Fotografe a folha ou grave um vídeo</p></div>
        <div class="landing-step"><div class="landing-step-num">2</div><p>IA analisa e identifica os problemas</p></div>
        <div class="landing-step"><div class="landing-step-num">3</div><p>Receba o plano de ação com doses</p></div>
      </div>
    </div>
    <div class="landing-social">
      <div class="landing-social-item"><strong>+500</strong>lavouras analisadas</div>
      <div class="landing-social-item"><strong>32</strong>tipos de diagnóstico</div>
      <div class="landing-social-item"><strong>98%</strong>de precisão</div>
    </div>
    <div class="landing-cta" style="margin-top:24px">
      <button class="btn-landing-cta" onclick="irParaCadastroInicial()">🌿 Começar Agora — Grátis</button>
      <div class="landing-nota">Sem cartão de crédito · Cancele quando quiser</div>
    </div>
  </div>
</div>

<!-- TELA 2: CADASTRO INICIAL -->
<div id="tela-cadastro-inicial">
  <div class="cad-inicial-header">
    <div class="cad-inicial-logo">🌿</div>
    <div class="cad-inicial-titulo">Doutor Café</div>
    <div class="cad-inicial-sub">Libere suas 15 análises gratuitas</div>
  </div>
  <div class="cad-inicial-card">
    <h3>Criar minha conta grátis</h3>
    <p>Preencha seus dados para acessar o diagnóstico por IA. Sem cobrança agora.</p>
    <div class="cad-field"><label>Nome completo *</label><input type="text" id="cadIniNome" placeholder="Ex: João da Silva" autocomplete="name"></div>
    <div class="cad-field"><label>CPF *</label><input type="tel" id="cadIniCpf" placeholder="000.000.000-00" maxlength="14" oninput="mascararCpf(this)"></div>
    <div class="cad-field"><label>Celular *</label><input type="tel" id="cadIniCelular" placeholder="(00) 00000-0000" maxlength="15" oninput="mascararCelular(this)"></div>
    <div class="cad-field"><label>E-mail <span class="opcional">(opcional)</span></label><input type="email" id="cadIniEmail" placeholder="seuemail@gmail.com" autocomplete="email"></div>
    <div class="cad-field">
      <label>🔐 PIN de 4 dígitos *</label>
      <input type="tel" id="cadIniPin" placeholder="••••" maxlength="4" oninput="this.value=this.value.replace(/[^0-9]/g,'').substr(0,4)" style="letter-spacing:12px;font-size:24px;font-weight:700;text-align:center;padding:14px">
      <small style="color:#888;font-size:11px;margin-top:4px;display:block">Use para entrar em outro celular. Anote e guarde!</small>
    </div>
    <button class="btn-cad-submit" onclick="submeterCadastroInicial()">✅ Liberar Minhas 15 Análises</button>
    <div style="text-align:center;margin-top:16px">
      <button onclick="abrirLoginCpf()" style="background:none;border:none;color:#2d8a3e;font-size:14px;font-weight:600;cursor:pointer;text-decoration:underline">Já tenho conta — Entrar com CPF</button>
    </div>
    <span class="cad-voltar" onclick="voltarParaLanding()">← Voltar</span>
  </div>
  <div class="cad-beneficios">
    <div class="cad-ben-item"><span>🔬</span><p>15 análises de folhas, solo e daninhas grátis</p></div>
    <div class="cad-ben-item"><span>📋</span><p>Plano de ação com dosagem por tanque</p></div>
    <div class="cad-ben-item"><span>🔒</span><p>Seus dados protegidos — nunca vendemos</p></div>
  </div>
</div>

<!-- MODAL SELEÇÃO DE TALHÃO -->
<div class="modal-talhao-overlay" id="modalTalhaoOverlay">
  <div class="modal-talhao-box">
    <div class="modal-talhao-titulo">🌿 Qual Talhão?</div>
    <div class="modal-talhao-sub">Selecione o talhão que será analisado</div>
    <div id="listaTalhoesModal"></div>
    <button class="btn-criar-talhao-modal" onclick="abrirCriarTalhao()">+ Criar Novo Talhão</button>
    <button onclick="continuarSemTalhao()" style="width:100%;padding:12px;background:none;border:none;color:#888;font-size:14px;cursor:pointer;margin-top:4px">Continuar sem talhão →</button>
  </div>
</div>

<!-- MODAL CRIAR TALHÃO -->
<div class="modal-criar-talhao" id="modalCriarTalhao">
  <div class="criar-talhao-box">
    <div class="criar-talhao-titulo">🌱 Novo Talhão</div>
    <label class="criar-talhao-label">Nome do Talhão *</label>
    <input class="criar-talhao-input" id="ctNome" type="text" placeholder="Ex: Baixada, Talhão do Meio, Terreirão">
    <label class="criar-talhao-label">Variedade</label>
    <select class="criar-talhao-select" id="ctVariedade">
      <option value="">Selecionar...</option>
      <option>Catuaí Vermelho</option><option>Catuaí Amarelo</option><option>Mundo Novo</option><option>Arara</option>
      <option>Bourbon Amarelo</option><option>Bourbon Vermelho</option><option>Topázio</option><option>Acauã</option>
      <option>Catucaí</option><option>Paraíso MG</option><option>Outra</option>
    </select>
    <div class="criar-talhao-row">
      <div><label class="criar-talhao-label">Idade (anos)</label><input class="criar-talhao-input" id="ctIdade" type="number" placeholder="Ex: 5" min="1" max="50"></div>
      <div><label class="criar-talhao-label">Área (ha)</label><input class="criar-talhao-input" id="ctArea" type="number" placeholder="Ex: 3.5" step="0.1"></div>
    </div>
    <button class="btn-salvar-talhao" onclick="salvarNovoTalhao()">✅ Criar Talhão</button>
    <button class="btn-cancelar-talhao" onclick="fecharCriarTalhao()">Cancelar</button>
  </div>
</div>

<!-- MODAL HISTÓRICO DO TALHÃO -->
<div class="modal-hist-talhao" id="modalHistTalhao">
  <div class="hist-talhao-header">
    <div class="hist-talhao-back" onclick="fecharHistTalhao()">← Voltar</div>
    <div class="hist-talhao-nome" id="histTalhaoNome">Talhão</div>
    <div class="hist-talhao-info" id="histTalhaoInfo"></div>
  </div>
  <div id="histTalhaoLista" style="padding-bottom:32px"></div>
</div>

<!-- MODAL LOGIN CPF -->
<div class="modal-talhao-overlay" id="modalLoginCpf">
  <div class="modal-talhao-box">
    <div class="modal-talhao-titulo">🔐 Entrar com PIN</div>
    <div class="modal-talhao-sub">Digite seu PIN de 4 dígitos para acessar sua conta</div>
    <div class="cad-field" style="margin-top:16px">
      <label style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase">PIN de 4 dígitos *</label>
      <input type="tel" id="loginPinInput" placeholder="••••" maxlength="4" oninput="this.value=this.value.replace(/[^0-9]/g,'').substr(0,4)" onkeydown="if(event.key==='Enter')confirmarLoginPin()" style="width:100%;padding:20px 14px;border:1.5px solid #ddd;border-radius:12px;font-size:36px;font-weight:700;text-align:center;letter-spacing:16px;box-sizing:border-box;margin-top:6px">
    </div>
    <div id="loginCpfErro" style="color:#e53935;font-size:13px;text-align:center;min-height:20px;margin-bottom:8px"></div>
    <button onclick="confirmarLoginPin()" style="width:100%;padding:14px;background:linear-gradient(135deg,#2d8a3e,#1a5c2a);color:white;border:none;border-radius:16px;font-size:15px;font-weight:700;cursor:pointer">✅ Entrar na minha conta</button>
    <button onclick="fecharLoginCpf()" style="width:100%;padding:12px;background:none;border:none;color:#888;font-size:14px;cursor:pointer;margin-top:8px">Cancelar</button>
  </div>
</div>

<!-- MODAL PLANOS -->
<div class="modal-overlay" id="modalPlanos">
  <div class="modal-planos">
    <button onclick="fecharModal()" style="position:absolute;top:14px;left:14px;background:#f0ece4;border:none;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;color:var(--marrom);cursor:pointer;display:flex;align-items:center;gap:6px;z-index:5;font-family:'DM Sans',sans-serif;">&#8592; Voltar</button>
    <div class="modal-titulo">&#127807; Doutor Caf&#233; Premium</div>
    <div class="modal-sub" id="modalSubtitulo">Escolha o plano ideal para sua lavoura</div>
    <div class="modal-esgotado" id="modalEsgotado" style="display:none"><p>&#128274; Suas análises gratuitas foram usadas. Assine para continuar!</p></div>
    <div class="toggle-ciclo">
      <button class="toggle-btn ativo" id="btnMensal" onclick="setCiclo('mensal')">Mensal</button>
      <button class="toggle-btn" id="btnAnual" onclick="setCiclo('anual')">Anual <span class="toggle-economia">2 meses gr&#225;tis</span></button>
    </div>
    <div class="plano-card">
      <div class="plano-nome">&#127807; Plano B&#225;sico</div>
      <div class="plano-preco"><span class="plano-valor" id="precoBasico">R$29,90</span><span class="plano-periodo">/m&#234;s</span></div>
      <div class="plano-anual-desc" id="descBasico" style="display:none">R$299,90/ano &#8212; equivale a 2 meses gr&#225;tis!</div>
      <ul class="plano-features"><li>130 análises por mês</li><li>10 análises por vídeo/mês</li><li>Diagnóstico de doenças e pragas</li><li>Calculadora de fungicida</li><li>Análise de solo</li><li>Plantas daninhas</li><li>Suporte via WhatsApp</li></ul>
      <button class="btn-assinar" onclick="assinar('basico')">&#128179; Assinar com Cart&#227;o</button>
      <button class="btn-pix-plano" onclick="abrirPix('basico')">&#9889; Pagar via PIX</button>
    </div>
    <div class="plano-card destaque">
      <div class="plano-badge">&#11088; Mais Popular</div>
      <div class="plano-nome">&#128640; Plano Pro</div>
      <div class="plano-preco"><span class="plano-valor" id="precoPro">R$39,90</span><span class="plano-periodo">/m&#234;s</span></div>
      <div class="plano-anual-desc" id="descPro" style="display:none">R$399,90/ano &#8212; equivale a 2 meses gr&#225;tis!</div>
      <ul class="plano-features"><li>250 análises por mês</li><li>25 análises por vídeo/mês</li><li>Tudo do Básico</li><li>Histórico completo</li><li>Atendimento prioritário</li><li>Acesso a novos recursos primeiro</li></ul>
      <button class="btn-assinar" onclick="assinar('pro')">&#128179; Assinar com Cart&#227;o</button>
      <button class="btn-pix-plano" onclick="abrirPix('pro')">&#9889; Pagar via PIX</button>
    </div>
    <div class="plano-card">
      <div class="plano-badge" style="background:linear-gradient(135deg,#b8860b,#daa520)">&#128081; Premium</div>
      <div class="plano-nome">&#128081; Plano Premium</div>
      <div class="plano-preco"><span class="plano-valor" id="precoPremium">R$49,90</span><span class="plano-periodo">/m&#234;s</span></div>
      <div class="plano-anual-desc" id="descPremium" style="display:none">R$499,90/ano &#8212; equivale a 2 meses gr&#225;tis!</div>
      <ul class="plano-features"><li>400 análises por mês</li><li>50 análises por vídeo/mês</li><li>Tudo do Pro</li><li>Prioridade máxima no suporte</li><li>Relatório mensal da lavoura</li><li>Acesso antecipado a novidades</li></ul>
      <button class="btn-assinar" onclick="assinar('premium')">&#128179; Assinar com Cart&#227;o</button>
      <button class="btn-pix-plano" onclick="abrirPix('premium')">&#9889; Pagar via PIX</button>
    </div>
    <div class="plano-card">
      <div class="plano-nome">&#127970; Empresarial</div>
      <div class="plano-preco"><span class="plano-valor" style="font-size:20px">A combinar</span></div>
      <ul class="plano-features"><li>Cooperativas e revendas</li><li>Multi-usuário</li><li>Dashboard e relatórios</li><li>Contrato personalizado</li><li>R$300 a R$2.000/mês</li></ul>
      <button class="btn-assinar" onclick="contatoEmpresarial()" style="background:linear-gradient(135deg,#795548,#4e342e)">Falar com Gerente Comercial</button>
    </div>
    <div class="continuar-gratis-box">
      <div class="continuar-gratis-txt">&#127807; Plano Gratuito &mdash; <strong id="restantesModal">15</strong> an&aacute;lises restantes</div>
      <button class="btn-continuar-gratis" onclick="fecharModal()">Continuar usando gr&aacute;tis &#8594;</button>
      <p style="font-size:11px;color:#888;margin-top:8px">Sem cartão de crédito</p>
    </div>
  </div>
</div>

<!-- MODAL PIX -->
<div class="modal-pix" id="modalPix">
  <div class="modal-pix-box">
    <div class="modal-pix-titulo">&#9889; Pagar via PIX</div>
    <div class="modal-pix-sub" id="pixSubtitulo">Preencha seus dados</div>
    <div id="pixArea"></div>
    <button class="btn-fechar-pix" onclick="fecharPix()">Cancelar</button>
  </div>
</div>

<!-- TELA PRINCIPAL -->
<div id="tela-principal" style="display:none">
<div class="header">
  <img class="header-img" src="cafe.jpeg" alt="Café">
  <div class="header-overlay"></div>
  <div class="header-content">
    <span class="logo-icon">&#127807;</span>
    <h1>Doutor <span>Caf&#233;</span></h1>
    <div class="sub">O agr&#244;nomo no seu bolso</div>
    <div class="regiao-tag" id="regiaoTag">&#128205; Localizando...</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:2px">
      <div class="plano-chip" id="planoChip" onclick="abrirModal(false)">
        <span class="plano-chip-dot" id="planoChipDot"></span>
        <span id="planoChipTxt">Plano Gratuito</span>
        <span style="opacity:0.7">·</span>
        <span id="planoChipAnalises">15 análises restantes</span>
      </div>
    </div>
  </div>
</div>
<div class="wave"></div>

<div class="corpo">
  <input id="cam" type="file" accept="image/*" capture="environment">
  <input id="gal" type="file" accept="image/*,video/*">
  <input id="vid" type="file" accept="video/*" capture="environment">
  <input id="solo" type="file" accept="image/*" capture="environment">
  <input id="soloGal" type="file" accept="image/*">
  <input id="daninha" type="file" accept="image/*" capture="environment">
  <input id="daninaGal" type="file" accept="image/*">
  <canvas id="canvas"></canvas>

  <div class="secao-card tema-folha">
    <div class="secao-card-head">
      <div class="secao-badge">&#127807;</div>
      <div class="secao-card-tit"><h3>Diagn&#243;stico da Folha do Caf&#233;</h3><p>Doen&#231;a, praga ou falta de nutriente na folha do cafeeiro</p></div>
    </div>
    <button class="btn-foto" id="btnCam"><span class="btn-icon">&#128247;</span><span class="btn-text">Fotografar a Folha do Caf&#233;<small>Doen&#231;as, pragas e defici&#234;ncias</small></span></button>
    <div class="btn-video-wrap">
      <button class="btn-video" id="btnVid"><span class="btn-icon">&#127909;</span><span class="btn-text">Gravar V&#237;deo da Folha do Caf&#233;<small>Mais preciso &#8212; v&#225;rios &#226;ngulos</small></span></button>
      <div class="video-badge" id="videoBadge">
        <span id="videoBadgeTxt">&#127909; Carregando...</span>
        <div class="video-badge-bar"><div class="video-badge-fill" id="videoBadgeFill" style="width:100%"></div></div>
        <span id="videoBadgeNum"></span>
      </div>
    </div>
    <button class="btn-galeria" id="btnGal"><span class="btn-icon">&#128444;&#65039;</span><span class="btn-text">Foto da Folha na Galeria<small>Use uma foto j&#225; tirada</small></span></button>
  </div>

  <div id="spinner">
    <span class="spinner-folha">&#128300;</span>
    <p id="spinnerTexto">Analisando...</p>
    <small id="spinnerSub">Identificando sintomas e comparando padr&#245;es</small>
  </div>
  <div id="resultado"></div>

  <div class="secao-card tema-solo">
    <div class="secao-card-head">
      <div class="secao-badge">&#129514;</div>
      <div class="secao-card-tit"><h3>An&#225;lise do Laudo de Solo</h3><p>Aquele papel do laborat&#243;rio com os valores do solo</p></div>
    </div>
    <div class="solo-row">
      <button class="btn-solo" id="btnSolo"><span class="btn-icon">&#129514;</span><span class="btn-text">Fotografar Laudo<small>O papel do laborat&#243;rio</small></span></button>
      <button class="btn-solo-gal" id="btnSoloGal"><span class="btn-icon">&#128196;</span><span class="btn-text">Laudo da Galeria<small>Foto do papel</small></span></button>
    </div>
  </div>

  <div class="secao-card tema-mato">
    <div class="secao-card-head">
      <div class="secao-badge">&#127806;</div>
      <div class="secao-card-tit"><h3>Erva Daninha / Mato</h3><p>A planta que nasce no meio do caf&#233; &#8212; revela o que o solo tem</p></div>
    </div>
    <div class="solo-row">
      <button class="btn-daninha" id="btnDaninha"><span class="btn-icon">&#128269;</span><span class="btn-text">Identificar o Mato<small>A planta que nasce no meio do caf&#233;</small></span></button>
      <button class="btn-daninha-gal" id="btnDaninhaGal"><span class="btn-icon">&#128444;&#65039;</span><span class="btn-text">Mato da Galeria<small>Foto j&#225; tirada</small></span></button>
    </div>
  </div>

  <div class="dica">
    <span style="font-size:16px;flex-shrink:0;margin-top:1px">&#128161;</span>
    <p><strong>Dica:</strong> Fotografe a face inferior da folha tamb&#233;m. A ferrugem aparece embaixo com p&#243; alaranjado.</p>
  </div>

  <div class="secao-titulo" style="margin-top:4px">&#9749; Pre&#231;o do Caf&#233; Hoje</div>
  <div class="card-clima" id="cardPrecoCafe"><div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Consultando pre&#231;o...</span></div></div>

  <div class="secao-titulo" style="margin-top:4px">&#127780;&#65039; Clima e Risco Agora</div>
  <div class="card-clima" id="cardClima"><div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Obtendo clima...</span></div></div>

  <div class="secao-titulo" style="margin-top:4px">&#128197; Calend&#225;rio Fitossanit&#225;rio</div>
  <div class="card-calendario" id="cardCalendario"></div>

  <div class="secao-titulo" style="margin-top:4px" id="tituloSecaoHistorico">&#128203; Hist&#243;rico de An&#225;lises</div>

  <div class="talhoes-section" id="secaoTalhoes">
    <div class="talhoes-titulo">🗺️ Meus Talhões <button onclick="limparTodosTalhoes()" style="background:none;border:none;font-size:11px;color:#aaa;cursor:pointer;text-decoration:underline;font-weight:400;letter-spacing:0;text-transform:none;margin-left:8px">Limpar tudo</button></div>
    <div class="talhoes-grid" id="talhoesList"></div>
    <button class="btn-novo-talhao" onclick="abrirCriarTalhaoSemFoto()">+ Cadastrar Novo Talhão</button>
  </div>

  <div id="areaHistorico"></div>

  <div class="secao-titulo" style="margin-top:4px">&#10067; O Que Significam os Termos</div>
  <details class="dica" style="display:block">
    <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--marrom)">Toque para ver explica&#231;&#245;es simples dos termos t&#233;cnicos</summary>
    <div style="margin-top:10px;font-size:12px;color:var(--cinza);line-height:1.8">
      <p><strong>Calda</strong> — a mistura de &#225;gua com o produto, pronta pra pulverizar.</p>
      <p><strong>Protetor</strong> — fica na superf&#237;cie da folha, lava com a chuva, precisa reaplicar mais vezes.</p>
      <p><strong>Sist&#234;mico</strong> — entra na planta, dura mais, mas n&#227;o pode ser usado sozinho por muito tempo (a doen&#231;a pode criar resist&#234;ncia).</p>
      <p><strong>P&#243;s-emerg&#234;ncia</strong> — aplicado depois que a planta/erva daninha j&#225; nasceu.</p>
      <p><strong>Pr&#233;-emerg&#234;ncia</strong> — aplicado antes da planta/erva daninha nascer, no solo.</p>
      <p><strong>K2O, P2O5, MgO</strong> — jeito que o adubo mede a quantidade de nutriente (pot&#225;ssio, f&#243;sforo, magn&#233;sio). Confira essa % no r&#243;tulo do saco que voc&#234; comprar.</p>
      <p><strong>Fertirriga&#231;&#227;o</strong> — aplicar adubo dissolvido junto com a &#225;gua de irriga&#231;&#227;o.</p>
      <p><strong>Banco de sementes</strong> — sementes de erva daninha acumuladas no solo, que continuam nascendo por anos se n&#227;o controladas antes de florescer.</p>
      <p><strong>Est&#225;gio (1 a 5)</strong> — o qu&#227;o avan&#231;ado est&#225; o problema. 1 &#233; inicial, 5 &#233; grave.</p>
      <p><strong>Car&#234;ncia</strong> — dias que precisa esperar ap&#243;s aplicar o produto antes de colher.</p>
    </div>
  </details>

  <div class="secao-titulo" style="margin-top:4px">&#128172; Fale Conosco</div>
  <div class="dica" style="flex-direction:column;gap:10px">
    <p style="font-size:13px;color:var(--marrom);font-weight:600">Tem d&#250;vidas, sugest&#245;es ou encontrou algum problema?</p>
    <p style="font-size:12px;color:var(--cinza);line-height:1.5">Nossa equipe responde em at&#233; 24 horas.</p>
    <button onclick="enviarEmail()" style="background:linear-gradient(135deg,var(--verde-claro),var(--verde));color:white;border:none;border-radius:14px;padding:14px 20px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;justify-content:center;"><span>&#9993;&#65039;</span> Enviar Mensagem</button>
    <button onclick="abrirWhatsapp()" style="background:#25D366;color:white;border:none;border-radius:14px;padding:14px 20px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;justify-content:center;"><span>&#128242;</span> Falar com Gerente Comercial</button>
  </div>

  <div style="text-align:center;padding:16px 0 8px;font-size:11px;color:var(--cinza)">
    &#127807; Doutor Caf&#233; &#169; 2026 &#183; Todos os direitos reservados<br>
    <span style="font-size:10px">CNPJ 67.223.948/0001-87</span>
  </div>
  <div style="height:72px"></div>
</div>

<nav class="nav-inferior" id="navInferior" style="display:none">
  <button class="nav-btn ativo" id="navInicio" onclick="navegarInicio()">
    <span class="nav-btn-icon">&#127807;</span>
    <span class="nav-btn-label">In&#237;cio</span>
  </button>
  <button class="nav-btn" id="navHistorico" onclick="navegarHistorico()">
    <span class="nav-btn-icon">&#128203;</span>
    <span class="nav-btn-label">Hist&#243;rico</span>
  </button>
  <button class="nav-btn" id="navPlanos" onclick="navegarPlanos()">
    <span class="nav-btn-icon">&#128142;</span>
    <span class="nav-btn-label">Planos</span>
    <span class="nav-badge" id="navPlanosBadge" style="display:none"></span>
  </button>
  <button class="nav-btn" id="navMais" onclick="navegarMais()">
    <span class="nav-btn-icon">&#9776;</span>
    <span class="nav-btn-label">Mais</span>
  </button>
</nav>

<!-- MODAL CADASTRO -->
<div class="modal-cadastro" id="modalCadastro">
  <div class="modal-cadastro-box">
    <span class="modal-cadastro-icon">🌿</span>
    <div class="modal-cadastro-titulo">Continue usando gratuitamente!</div>
    <div class="modal-cadastro-sub">Cadastre-se para continuar usando o Doutor Café e salvar seu histórico de análises.</div>
    <div class="modal-cadastro-bonus">🌿 Cadastro rápido e gratuito</div>
    <label class="cad-label">Nome completo *</label>
    <input class="cad-input" id="cadNome" type="text" placeholder="Ex: João da Silva">
    <label class="cad-label">WhatsApp / Celular *</label>
    <input class="cad-input" id="cadCelular" type="tel" placeholder="(35) 99999-9999" maxlength="15" oninput="mascararCelular(this)">
    <label class="cad-label">Região produtora</label>
    <select class="cad-select" id="cadRegiao">
      <option value="">Selecione sua região...</option>
      <option value="Mogiana">Mogiana (SP/MG)</option><option value="Sul de Minas">Sul de Minas</option>
      <option value="Cerrado Mineiro">Cerrado Mineiro</option><option value="Matas de Minas">Matas de Minas</option>
      <option value="Chapada Diamantina">Chapada Diamantina (BA)</option><option value="Planalto da Bahia">Planalto da Bahia</option>
      <option value="Rondonia">Rondônia</option><option value="Norte do Parana">Norte do Paraná</option>
      <option value="Espirito Santo">Espírito Santo</option><option value="Alta Paulista">Alta Paulista (SP)</option>
      <option value="Outra">Outra região</option>
    </select>
    <label class="cad-label">E-mail (opcional)</label>
    <input class="cad-input" id="cadEmail" type="email" placeholder="seuemail@gmail.com">
    <button class="btn-cadastrar" onclick="confirmarCadastro()">✅ Cadastrar e Continuar</button>
    <div class="cad-privacidade">🔒 Seus dados são protegidos e não serão compartilhados com terceiros.</div>
  </div>
</div>

</div>
<script>
// ── PLANOS E PAGAMENTO ──
var PLANO_KEY="doutorcafe_plano",ANALISES_KEY="doutorcafe_analises",LIMITE_GRATIS=15,cicloAtual="mensal";
var LIMITE_BASICO=130,LIMITE_PRO=250,LIMITE_PREMIUM=400;

function getPlano(){try{return JSON.parse(localStorage.getItem(PLANO_KEY))||{tipo:"gratuito"};}catch(e){return{tipo:"gratuito"};}}
function salvarPlano(p){try{localStorage.setItem(PLANO_KEY,JSON.stringify(p));}catch(e){}}
function getAnalisesUsadas(){return parseInt(localStorage.getItem(ANALISES_KEY)||"0");}
function incrementarAnalise(){
  // Atualiza cache local imediatamente (UI responsiva)
  var u=getAnalisesUsadas()+1;localStorage.setItem(ANALISES_KEY,u.toString());atualizarContador();
  // Sincroniza com o servidor (fonte de verdade real, cross-device)
  if(usuarioAtual&&usuarioAtual.userId){
    fetch("https://doutor-cafe-production.up.railway.app/incrementar-analise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:usuarioAtual.userId})})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d&&typeof d.analisesRestantes==="number"&&typeof d.limite==="number"){
        // Servidor manda a verdade: recalcula "usadas" a partir do que ele retornou
        var usadasReais=Math.max(0,d.limite-d.analisesRestantes);
        localStorage.setItem(ANALISES_KEY,usadasReais.toString());
        atualizarContador();
      }
    })
    .catch(function(){/* offline: mantém a contagem local, sincroniza na proxima abertura */});
  }
  return u;
}
function podeanalisar(){var p=getPlano();if(p.tipo==="pro")return getAnalisesUsadas()%(LIMITE_PRO+1)<LIMITE_PRO;if(p.tipo==="premium")return getAnalisesUsadas()%(LIMITE_PREMIUM+1)<LIMITE_PREMIUM;if(p.tipo==="basico")return getAnalisesUsadas()%(LIMITE_BASICO+1)<LIMITE_BASICO;return getAnalisesUsadas()<LIMITE_GRATIS;}

function sincronizarContadorServidor(){
  if(!(usuarioAtual&&usuarioAtual.userId))return;
  fetch("https://doutor-cafe-production.up.railway.app/analises-restantes/"+usuarioAtual.userId)
    .then(function(r){return r.json();})
    .then(function(d){
      if(d&&typeof d.analisesRestantes==="number"&&typeof d.limite==="number"){
        var usadasReais=Math.max(0,d.limite-d.analisesRestantes);
        localStorage.setItem(ANALISES_KEY,usadasReais.toString());
        // Se o servidor conhece o plano do usuario, alinha o plano local tambem
        if(d.plano&&d.plano!=="gratuito"){var pl=getPlano();if(pl.tipo!==d.plano){pl.tipo=d.plano;salvarPlano(pl);}}
        atualizarContador();
      }
    })
    .catch(function(){/* offline: usa cache local */});
}

function atualizarContador(){
  var p=getPlano(),usado=getAnalisesUsadas();
  var cad=getCadastro();
  var r; // análises restantes
  if(p.tipo==="premium"){r=LIMITE_PREMIUM-(usado%LIMITE_PREMIUM);}
  else if(p.tipo==="pro"){r=LIMITE_PRO-(usado%LIMITE_PRO);}
  else if(p.tipo==="basico"){r=LIMITE_BASICO-(usado%LIMITE_BASICO);}
  else{r=Math.max(0,TOTAL_GRATIS_COM_CAD-usado);}

  // ── CHIP UNIFICADO (plano + análises restantes) ────────────
  var chipTxt=document.getElementById("planoChipTxt"),chipDot=document.getElementById("planoChipDot"),chipAnalises=document.getElementById("planoChipAnalises");
  if(chipTxt&&chipDot){
    var nomePlano={gratuito:"Plano Gratuito",basico:"Plano Básico",pro:"Plano Pro",premium:"Plano Premium"}[p.tipo||"gratuito"]||"Plano Gratuito";
    var limitePlano=p.tipo==="premium"?LIMITE_PREMIUM:p.tipo==="pro"?LIMITE_PRO:p.tipo==="basico"?LIMITE_BASICO:TOTAL_GRATIS_COM_CAD;
    var pctRestante=r/limitePlano;
    chipTxt.textContent=nomePlano;
    if(chipAnalises)chipAnalises.textContent=r+(r===1?" análise restante":" análises restantes");
    chipDot.className="plano-chip-dot"+(pctRestante<=0.15?" vermelho":pctRestante<=0.30?" amarelo":"");
  }

  // ── BADGE DE VÍDEO ─────────────────────────────────────────
  atualizarBadgeVideo();

  // ── BADGE DA NAV (Planos) ──────────────────────────────────
  atualizarBadgeNav(p, r);
}

function atualizarBadgeNav(plano, restantes){
  var badge=document.getElementById("navPlanosBadge");
  if(!badge)return;
  // Só mostra badge de urgência para plano gratuito quando está acabando
  if((plano.tipo||"gratuito")==="gratuito" && restantes<=5){
    badge.textContent=restantes;
    badge.style.display="flex";
    badge.style.background=restantes<=2?"#e53935":"#f5a623";
  }else{
    badge.style.display="none";
  }
}

function atualizarBadgeVideo(){
  var badge=document.getElementById("videoBadge"),badgeTxt=document.getElementById("videoBadgeTxt"),badgeFill=document.getElementById("videoBadgeFill"),badgeNum=document.getElementById("videoBadgeNum");
  if(!badge||!badgeTxt||!badgeFill||!badgeNum)return;
  var VIDEO_LIM={gratuito:2,basico:10,pro:25,premium:50};
  var p=getPlano(),limite=VIDEO_LIM[p.tipo||"gratuito"]||2;
  // tenta pegar do servidor se tiver usuário logado
  var usados=parseInt(localStorage.getItem("doutorcafe_videos_usados")||"0");
  var restantes=Math.max(0,limite-usados);
  var pct=limite>0?restantes/limite:1;
  badgeTxt.textContent="🎥 Vídeos este mês: "+restantes+" de "+limite;
  badgeFill.style.width=(pct*100)+"%";
  badgeNum.textContent=restantes===0?"Esgotado":"";
  badge.className="video-badge"+(restantes===0?" esgotado":"");
  badgeFill.style.background=restantes===0?"#e53935":pct<=0.2?"#ffa726":"#3949ab";
  if(usuarioAtual&&usuarioAtual.userId){
    fetch("https://doutor-cafe-production.up.railway.app/analises-restantes/"+usuarioAtual.userId)
      .then(function(r){return r.json();}).then(function(d){
        if(d.videosRestantes!==undefined&&d.limiteVideo!==undefined){
          var rest=d.videosRestantes,lim=d.limiteVideo,p2=lim>0?rest/lim:1;
          localStorage.setItem("doutorcafe_videos_usados",(lim-rest).toString());
          badgeTxt.textContent="🎥 Vídeos este mês: "+rest+" de "+lim;
          badgeFill.style.width=(p2*100)+"%";
          badgeNum.textContent=rest===0?"Esgotado":"";
          badge.className="video-badge"+(rest===0?" esgotado":"");
          badgeFill.style.background=rest===0?"#e53935":p2<=0.2?"#ffa726":"#3949ab";
        }
      }).catch(function(){});
  }
}

function abrirModal(esgotado){document.getElementById("modalPlanos").classList.add("ativo");document.getElementById("modalEsgotado").style.display=esgotado?"block":"none";document.getElementById("modalSubtitulo").textContent=esgotado?"Continue diagnosticando sua lavoura sem limites":"Escolha o plano ideal para sua lavoura";}
function fecharModal(){document.getElementById("modalPlanos").classList.remove("ativo");}
function setCiclo(c){cicloAtual=c;document.getElementById("btnMensal").className="toggle-btn"+(c==="mensal"?" ativo":"");document.getElementById("btnAnual").className="toggle-btn"+(c==="anual"?" ativo":"");document.getElementById("precoBasico").textContent=c==="mensal"?"R$29,90":"R$24,92";document.getElementById("precoPro").textContent=c==="mensal"?"R$39,90":"R$33,25";var pp=document.getElementById("precoPremium");if(pp)pp.textContent=c==="mensal"?"R$49,90":"R$41,58";document.getElementById("descBasico").style.display=c==="anual"?"block":"none";document.getElementById("descPro").style.display=c==="anual"?"block":"none";var dp=document.getElementById("descPremium");if(dp)dp.style.display=c==="anual"?"block":"none";}
function assinar(tipo){var links={basico_mensal:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=3bdcbffc028a4d259f32fe37a96ae224",basico_anual:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=bd08a04de79f4213886611769b6c9486",pro_mensal:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=106181c5ed584a65af06403bd1af0608",pro_anual:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=661a046d15c9415a9508970d2f45c819",premium_mensal:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=5bcfb2b27c6241b8a433b3ec0fb2a5c7",premium_anual:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=346f4589aca84ba3b4e76351563fdbe1"};var url=links[tipo+"_"+cicloAtual];if(url)window.open(url,"_blank");else alert("Plano não encontrado.");}
function contatoEmpresarial(){window.open("https://wa.me/5535998823395?text="+encodeURIComponent("Olá! Tenho interesse no Plano Empresarial do Doutor Café."),"_blank");fecharModal();}
function verificarRetornoPagamento(){var params=new URLSearchParams(window.location.search),pagamento=params.get("pagamento"),planoId=params.get("plano");if(pagamento==="sucesso"&&planoId){var tipo=planoId.indexOf("premium")>-1?"premium":planoId.indexOf("pro")>-1?"pro":"basico";var nomePlano={premium:"Premium",pro:"Pro",basico:"Básico"}[tipo];salvarPlano({tipo:tipo,planoId:planoId,dataAssinatura:new Date().toISOString()});localStorage.setItem(ANALISES_KEY,"0");atualizarContador();alert("Bem-vindo ao Plano "+nomePlano+"! Suas análises estão liberadas.");window.history.replaceState({},"",window.location.pathname);}}

var ultimaFotoBase64 = null;
var HIST_KEY = "doutorcafe_hist";
var FILA_MAX = 50;
var TIMEOUT_MS = 150000;

function fetchComTimeout(url, opcoes, ms) {
  var controller = new AbortController();
  var timer = setTimeout(function(){ controller.abort(); }, ms);
  return fetch(url, Object.assign({}, opcoes, { signal: controller.signal }))
    .finally(function(){ clearTimeout(timer); });
}

// Tenta a chamada; se falhar (timeout, cold start da Railway, instabilidade
// pontual de rede), tenta mais UMA vez automaticamente antes de desistir.
// Isso cobre o caso comum de a Railway estar "dormindo": a 1ª tentativa acorda
// o servidor e pode estourar o tempo limite, mas a 2ª já encontra ele ativo.
function fetchComRetry(url, opcoes, ms) {
  return fetchComTimeout(url, opcoes, ms).catch(function(erroOriginal){
    return fetchComTimeout(url, opcoes, ms).catch(function(){
      throw erroOriginal;
    });
  });
}

var EMOJIS = {ferrugem:"\uD83D\uDFE0",bicho:"\uD83E\uDEB2",cercosporiose:"\uD83D\uDD35",aureolada:"\uD83D\uDFE3",phoma:"\u26AB",antracnose:"\uD83E\uDED9",ascochyta:"\uD83D\uDFE4",manteigosa:"\uD83E\uDED7",roseliniose:"\uD83D\uDC80",helmintosporiose:"\uD83D\uDD34",broca:"\uD83D\uDD73\uFE0F",acaro:"\uD83D\uDFEB",acaro_ferrugem:"\uD83D\uDFE5",cigarra:"\uD83E\uDD97",cochonilha:"\uD83E\uDD0D",lagarta:"\uD83D\uDC1B",nematoide:"\uD83E\uDEB1",nitrogenio:"\uD83C\uDF3F",magnesio:"\uD83D\uDFE1",potassio:"\uD83D\uDD25",fosforo:"\uD83D\uDC9C",calcio:"\uD83E\uDDB4",enxofre:"\uD83C\uDF15",boro:"\uD83D\uDFE6",zinco:"\uD83E\uDED7",ferro:"\uD83E\uDEA8",manganes:"\uD83D\uDFE4",cobre:"\uD83E\uDDE1",estresse_hidrico:"\uD83D\uDCA7",fitotoxicidade:"\u2697\uFE0F",escaldadura:"\u2600\uFE0F",fruto_verde:"\uD83D\uDFE2",fruto_maduro:"\uD83D\uDD34",fruto_passado:"\u26AB",antracnose_fruto:"\u26AB",fusariose_fruto:"\uD83D\uDFE4",cercosporiose_fruto:"\u26AA",phoma_fruto:"\u26AB",acaro_fruto:"\uD83D\uDFE4",mancha_manteigosa:"\uD83D\uDFE1",corynespora:"\uD83D\uDFE0",koleroga:"\uD83D\uDEA8",rizoctoniose:"\uD83D\uDFEB",cochonilha_raiz:"\uD83D\uDFE4",saudavel:"\u2705"};
var NOMES_VOZ = {ferrugem:"Ferrugem do café",bicho:"Bicho mineiro",cercosporiose:"Cercosporiose",aureolada:"Mancha aureolada",phoma:"Phoma",antracnose:"Antracnose",ascochyta:"Mancha Ascochyta",manteigosa:"Mancha manteigosa",roseliniose:"Roseliniose",helmintosporiose:"Helmintosporiose",broca:"Broca do café",acaro:"Ácaro vermelho",acaro_ferrugem:"Ácaro ferrugem falsa",cigarra:"Cigarra do cafeeiro",cochonilha:"Cochonilha",lagarta:"Lagarta das rosetas",nematoide:"Nematoide das galhas",nitrogenio:"Deficiência de nitrogênio",magnesio:"Deficiência de magnésio",potassio:"Deficiência de potássio",fosforo:"Deficiência de fósforo",calcio:"Deficiência de cálcio",enxofre:"Deficiência de enxofre",boro:"Deficiência de boro",zinco:"Deficiência de zinco",ferro:"Deficiência de ferro",manganes:"Deficiência de manganês",cobre:"Deficiência de cobre",estresse_hidrico:"Estresse hídrico",fitotoxicidade:"Fitotoxicidade",escaldadura:"Escaldadura solar",fruto_verde:"Fruto verde saudável",fruto_maduro:"Fruto maduro para colheita",fruto_passado:"Fruto passado do ponto",antracnose_fruto:"Antracnose nos frutos",fusariose_fruto:"Fusariose nos frutos",cercosporiose_fruto:"Cercosporiose nos frutos",phoma_fruto:"Phoma nos frutos",acaro_fruto:"Ácaro nos frutos",mancha_manteigosa:"Mancha manteigosa",corynespora:"Mancha de Corynespora",koleroga:"Koleroga queima do fio",rizoctoniose:"Rizoctoniose tardia",cochonilha_raiz:"Cochonilha das raízes",lagarta:"Lagarta desfolhadora",nematoide:"Nematoide",saudavel:"Planta saudável"};
var CATEGORIAS = {ferrugem:"Doença Fúngica",bicho:"Praga",cercosporiose:"Doença Fúngica",aureolada:"Doença Bacteriana",phoma:"Doença Fúngica",antracnose:"Doença Fúngica",ascochyta:"Doença Fúngica",manteigosa:"Doença Fúngica",roseliniose:"Doença Fúngica",helmintosporiose:"Doença Fúngica",broca:"Praga",acaro:"Praga",acaro_ferrugem:"Praga",cigarra:"Praga",cochonilha:"Praga",lagarta:"Praga",nematoide:"Praga",nitrogenio:"Deficiência Nutricional",magnesio:"Deficiência Nutricional",potassio:"Deficiência Nutricional",fosforo:"Deficiência Nutricional",calcio:"Deficiência Nutricional",enxofre:"Deficiência Nutricional",boro:"Deficiência Nutricional",zinco:"Deficiência Nutricional",ferro:"Deficiência Nutricional",manganes:"Deficiência Nutricional",cobre:"Deficiência Nutricional",estresse_hidrico:"Estresse Ambiental",fitotoxicidade:"Estresse Ambiental",escaldadura:"Estresse Ambiental",fruto_verde:"Fruto",fruto_maduro:"Fruto",fruto_passado:"Fruto Danificado",antracnose_fruto:"Doença Fúngica — Fruto",fusariose_fruto:"Doença Fúngica — Fruto",cercosporiose_fruto:"Doença Fúngica — Fruto",phoma_fruto:"Doença Fúngica — Fruto",acaro_fruto:"Praga — Fruto",mancha_manteigosa:"Doença Viral/Fúngica",corynespora:"Doença Fúngica",koleroga:"Doença Fúngica",rizoctoniose:"Doença Fúngica — Caule",cochonilha_raiz:"Praga — Raiz",saudavel:"Planta Saudável"};
var CORES_ESTAGIO = ["#4caf50","#8bc34a","#ffc107","#ff9800","#f44336"];
var MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── CADASTRO DE USUÁRIO ──
var CADASTRO_KEY = "doutorcafe_cadastro";
var ANALISES_GRATIS_SEM_CAD = 5;
var ANALISES_BONUS_CAD = 10;
var TOTAL_GRATIS_COM_CAD = 15;

function getCadastro(){try{return JSON.parse(localStorage.getItem(CADASTRO_KEY))||null;}catch(e){return null;}}
function salvarCadastroLocal(dados){try{localStorage.setItem(CADASTRO_KEY,JSON.stringify(dados));}catch(e){}}

function deveAbrirCadastroAposAnalise(){var cad=getCadastro();var usado=getAnalisesUsadas();var p=getPlano();if(p.tipo!=="gratuito")return false;if(cad)return false;return usado>=ANALISES_GRATIS_SEM_CAD;}

function abrirModalCadastro(){document.getElementById("modalCadastro").classList.add("ativo");}

function mascararCelular(input){var v=input.value.replace(/\D/g,'');if(v.length>11)v=v.slice(0,11);if(v.length>7)v='('+v.slice(0,2)+') '+v.slice(2,7)+'-'+v.slice(7);else if(v.length>2)v='('+v.slice(0,2)+') '+v.slice(2);else if(v.length>0)v='('+v;input.value=v;}

function confirmarCadastro(){
  var nome=document.getElementById('cadNome').value.trim();var celular=document.getElementById('cadCelular').value.trim();var regiao=document.getElementById('cadRegiao').value;var email=document.getElementById('cadEmail').value.trim();
  if(!nome){alert('Informe seu nome completo.');return;}if(celular.replace(/\D/g,'').length<10){alert('Informe um celular válido.');return;}
  var btn=document.querySelector('.btn-cadastrar');btn.textContent='Cadastrando...';btn.disabled=true;
  var dados={nome:nome,celular:celular,regiao:regiao,email:email,dataCadastro:new Date().toISOString()};
  fetch('https://doutor-cafe-production.up.railway.app/cadastrar-usuario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:obterUserId(),nome:nome,celular:celular,regiao:regiao,email:email})})
  .then(function(r){return r.json();}).then(function(d){salvarCadastroLocal(dados);document.getElementById('modalCadastro').classList.remove('ativo');atualizarContador();alert('✅ Cadastro atualizado com sucesso!');btn.textContent='✅ Cadastrar e Continuar';btn.disabled=false;})
  .catch(function(){salvarCadastroLocal(dados);document.getElementById('modalCadastro').classList.remove('ativo');atualizarContador();alert('✅ Cadastro atualizado com sucesso!');btn.textContent='✅ Cadastrar e Continuar';btn.disabled=false;});
}

// ── IndexedDB / Fila Offline ──
var _db = null;
function abrirDB(callback){if(_db){callback(_db);return;}var req=indexedDB.open("doutorcafe_db",1);req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains("fila"))db.createObjectStore("fila",{keyPath:"id"});};req.onsuccess=function(e){_db=e.target.result;callback(_db);};req.onerror=function(){callback(null);};}
function lerFila(callback){abrirDB(function(db){if(!db){callback([]);return;}var tx=db.transaction("fila","readonly");var req=tx.objectStore("fila").getAll();req.onsuccess=function(){var arr=req.result||[];arr.sort(function(a,b){return a.id-b.id;});callback(arr);};req.onerror=function(){callback([]);};});}

// ── CORREÇÃO 1: adicionarNaFila salva talhaoId junto com o item ──
function adicionarNaFila(fotoBase64, frames, tipo, callback) {
  lerFila(function(fila) {
    if (fila.length >= FILA_MAX) { alert("A fila já tem "+FILA_MAX+" itens."); if (callback) callback(false); return; }
    var agora = new Date();
    var talhaoId = localStorage.getItem("dc_analise_talhao_id") || null;
    var item = {
      id: Date.now(),
      foto: fotoBase64,
      hora: agora.getHours()+":"+String(agora.getMinutes()).padStart(2,"0"),
      data: agora.getDate()+"/"+(agora.getMonth()+1)+"/"+agora.getFullYear(),
      talhaoId: talhaoId,
      tipo: tipo || (frames ? "video" : "folha")
    };
    if (frames) { item.frames = frames; item.isVideo = true; }
    abrirDB(function(db) {
      if (!db) { if (callback) callback(false); return; }
      var tx = db.transaction("fila", "readwrite");
      tx.objectStore("fila").add(item);
      tx.oncomplete = function() { if (callback) callback(true); };
      tx.onerror = function() { if (callback) callback(false); };
    });
  });
}

function removerDaFila(id){abrirDB(function(db){if(!db)return;var tx=db.transaction("fila","readwrite");tx.objectStore("fila").delete(id);tx.oncomplete=function(){renderAreaHistorico();renderTalhoes();};});}
function limparFila(){lerFila(function(fila){if(!confirm("Limpar todas as "+fila.length+" fotos da fila?"))return;abrirDB(function(db){if(!db)return;var tx=db.transaction("fila","readwrite");tx.objectStore("fila").clear();tx.oncomplete=function(){renderAreaHistorico();};});});}

// ── CORREÇÃO 2: analisarDaFila restaura talhaoId antes do fetch ──
function analisarDaFila(id) {
  if (!navigator.onLine) { alert("Ainda sem sinal."); return; }
  abrirDB(function(db) {
    if (!db) return;
    var tx = db.transaction("fila", "readwrite");
    var store = tx.objectStore("fila");
    var req = store.get(id);
    req.onsuccess = function() {
      var item = req.result; if (!item) return;
      store.delete(id);
      tx.oncomplete = function() {
        ultimaFotoBase64 = item.foto;
        // CORREÇÃO: restaurar talhão salvo no item da fila
        if (item.talhaoId) {
          localStorage.setItem("dc_analise_talhao_id", item.talhaoId);
        } else {
          localStorage.removeItem("dc_analise_talhao_id");
        }
        document.getElementById("spinner").style.display = "block";
        document.getElementById("resultado").style.display = "none";
        renderAreaHistorico();
        document.getElementById("spinner").scrollIntoView({behavior:"smooth",block:"start"});
        if (item.isVideo && item.frames) {
          document.getElementById("spinnerTexto").textContent = "Analisando "+item.frames.length+" ângulos...";
          document.getElementById("spinnerSub").textContent = "Processando vídeo da fila offline";
          var bodyV = { frames: item.frames, tipo: "image/jpeg" };
          if (dadosGPS.regiao) bodyV.regiao = dadosGPS.regiao;
          if (dadosGPS.altitude) bodyV.altitude = dadosGPS.altitude;
          fetchComTimeout("https://doutor-cafe-production.up.railway.app/diagnostico-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bodyV)},TIMEOUT_MS)
          .then(function(r){return r.json();}).then(function(data){document.getElementById("spinner").style.display="none";mostrarResultado(data,true);incrementarAnalise();})
          .catch(function(){document.getElementById("spinner").style.display="none";adicionarNaFila(item.foto,item.frames,"video",function(ok){if(ok){renderAreaHistorico();document.getElementById("areaHistorico").scrollIntoView({behavior:"smooth",block:"start"});alert("Ainda sem conexão estável. Foto salva de volta na fila!");}});});
        } else if (item.tipo === "daninha") {
          document.getElementById("spinnerTexto").textContent = "Identificando planta daninha...";
          document.getElementById("spinnerSub").textContent = "Lendo o que ela revela sobre o seu solo (fila offline)";
          var bodyD = { imagem: item.foto, tipo: "image/jpeg" };
          if (dadosGPS.regiao) bodyD.regiao = dadosGPS.regiao;
          fetchComRetry("https://doutor-cafe-production.up.railway.app/identifica-daninha",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bodyD)},TIMEOUT_MS)
          .then(function(r){return r.json();}).then(function(data){document.getElementById("spinner").style.display="none";mostrarResultadoDaninha(data);incrementarAnalise();})
          .catch(function(){document.getElementById("spinner").style.display="none";adicionarNaFila(item.foto,null,"daninha",function(ok){if(ok){renderAreaHistorico();document.getElementById("areaHistorico").scrollIntoView({behavior:"smooth",block:"start"});alert("Ainda sem conexão estável. Foto salva de volta na fila!");}});});
        } else if (item.tipo === "solo") {
          document.getElementById("spinnerTexto").textContent = "Lendo laudo de solo...";
          document.getElementById("spinnerSub").textContent = "Interpretando valores e calculando recomendações (fila offline)";
          var bodyS = { imagem: item.foto, tipo: "image/jpeg" };
          if (dadosGPS.regiao) bodyS.regiao = dadosGPS.regiao;
          fetchComRetry("https://doutor-cafe-production.up.railway.app/analise-solo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bodyS)},TIMEOUT_MS)
          .then(function(r){return r.json();}).then(function(data){document.getElementById("spinner").style.display="none";mostrarResultadoSolo(data);incrementarAnalise();})
          .catch(function(){document.getElementById("spinner").style.display="none";adicionarNaFila(item.foto,null,"solo",function(ok){if(ok){renderAreaHistorico();document.getElementById("areaHistorico").scrollIntoView({behavior:"smooth",block:"start"});alert("Ainda sem conexão estável. Foto salva de volta na fila!");}});});
        } else {
          document.getElementById("spinnerTexto").textContent = "Analisando...";
          document.getElementById("spinnerSub").textContent = "Identificando sintomas e comparando padrões";
          var bodyF = { imagem: item.foto, tipo: "image/jpeg" };
          if (dadosGPS.regiao) bodyF.regiao = dadosGPS.regiao;
          if (dadosGPS.altitude) bodyF.altitude = dadosGPS.altitude;
          fetchComTimeout("https://doutor-cafe-production.up.railway.app/diagnostico",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bodyF)},TIMEOUT_MS)
          .then(function(r){return r.json();}).then(function(data){document.getElementById("spinner").style.display="none";mostrarResultado(data,false);incrementarAnalise();})
          .catch(function(){document.getElementById("spinner").style.display="none";adicionarNaFila(item.foto,null,"folha",function(ok){if(ok){renderAreaHistorico();document.getElementById("areaHistorico").scrollIntoView({behavior:"smooth",block:"start"});alert("Ainda sem conexão estável. Foto salva de volta na fila!");}});});
        }
      };
    };
  });
}

function renderAreaHistorico(){lerFila(function(fila){var tituloEl=document.getElementById("tituloSecaoHistorico");var areaEl=document.getElementById("areaHistorico");if(fila.length>0){tituloEl.textContent="\uD83D\uDCF8 Fotos Aguardando Análise";var online=navigator.onLine;var html='<div class="card-fila"><div class="fila-header"><div class="fila-header-esq"><div class="fila-titulo">\uD83D\uDCF7 Fila Offline</div><div class="fila-sub"><span class="fila-contagem">'+fila.length+'</span> foto'+(fila.length>1?'s':'')+" aguardando sinal</div></div><button class=\"fila-limpar\" onclick=\"limparFila()\">Limpar tudo</button></div>";if(!online){html+='<div class="offline-banner"><span class="offline-banner-icon">\uD83D\uDCF5</span><span class="offline-banner-txt">Sem internet. As fotos ficam salvas aqui. Quando chegar no sinal, toque na foto para analisar.</span></div>';}else{html+='<div class="offline-banner" style="background:#e8f5e9;margin-bottom:0"><span class="offline-banner-icon">\u2705</span><span class="offline-banner-txt" style="color:#1b5e20">Internet disponível! Toque em uma foto para analisar agora.</span></div>';}html+='<div class="fila-divisor" style="margin-top:12px"></div><div class="fila-grid">';fila.forEach(function(item,idx){var talhaoLabel="";if(item.talhaoId){var ts=getTalhoes();var t=ts.find(function(x){return x.id===item.talhaoId;});if(t)talhaoLabel=' <span style="font-size:8px;color:#ffd54f;font-weight:700">'+t.nome+'</span>';}html+='<div class="fila-item" onclick="analisarDaFila('+item.id+')"><img src="data:image/jpeg;base64,'+item.foto+'" alt="foto '+(idx+1)+'">';html+='<div class="fila-item-overlay"><div class="fila-item-hora">\uD83D\uDCC5 '+item.data+' '+item.hora+talhaoLabel+'</div><div class="fila-item-tap">'+(online?'\u25B6 Toque para analisar':'\u23F3 Aguardando sinal')+'</div></div>';html+='<div class="fila-item-num">'+(item.isVideo?'\uD83C\uDFA5':item.tipo==='daninha'?'\uD83D\uDD0D':item.tipo==='solo'?'\uD83E\uDDEA':(idx+1))+'</div>';html+='<button class="fila-item-del" onclick="event.stopPropagation();removerDaFila('+item.id+')" title="Remover">\u2715</button></div>';});html+='</div></div>';areaEl.innerHTML=html;}else{tituloEl.textContent="\uD83D\uDCCB Histórico de Análises";renderHistoricoNaArea(areaEl);}});}
function renderHistoricoNaArea(areaEl){try{var hist=JSON.parse(localStorage.getItem(HIST_KEY)||"[]");if(hist.length===0){areaEl.innerHTML='<div class="card-historico"><div class="hist-vazio">Nenhuma análise ainda. Fotografe uma folha!</div></div>';return;}var html='<div class="card-historico"><div class="hist-header"><div class="hist-titulo">\uD83D\uDCCB Últimas análises</div><button class="hist-limpar" onclick="limparHistorico()">Limpar</button></div><div class="hist-lista">';hist.forEach(function(h){var thumbHtml=h.foto?'<img class="hist-thumb" src="data:image/jpeg;base64,'+h.foto+'" alt="foto">':"<div class='hist-thumb-placeholder'>"+(h.emoji||"\uD83C\uDF3F")+"</div>";var nomes=h.diags?h.diags.map(function(d){return d.diagnostico.replace(/_/g," ");}).join(", "):h.diag.replace(/_/g," ");html+='<div class="hist-item">'+thumbHtml+'<div class="hist-info"><div class="hist-nome">'+nomes+'</div><div class="hist-data">'+h.data+(h.regiao?" \u00b7 "+h.regiao:"")+'</div></div></div>';});html+='</div></div>';areaEl.innerHTML=html;}catch(e){areaEl.innerHTML='<div class="card-historico"><div class="hist-vazio">Histórico não disponível.</div></div>';}}
function limparHistorico(){try{localStorage.removeItem(HIST_KEY);}catch(e){}renderAreaHistorico();}

// ── CLIMA ──
function calcularRiscoFerrugem(temp,umidade,chuva){var pontos=0;if(temp>=18&&temp<=22)pontos+=3;else if(temp>=15&&temp<=25)pontos+=1;if(umidade>=80)pontos+=3;else if(umidade>=70)pontos+=2;else if(umidade>=60)pontos+=1;if(chuva>5)pontos+=2;else if(chuva>0)pontos+=1;if(pontos>=7)return{nivel:"critico",txt:"Risco Crítico de Ferrugem",desc:"Condições ideais para infecção. Aplique fungicida imediatamente.",icon:"\uD83D\uDD34"};if(pontos>=5)return{nivel:"alto",txt:"Risco Alto de Ferrugem",desc:"Alta umidade e temperatura favorável. Aplique fungicida preventivo.",icon:"\uD83D\uDFE0"};if(pontos>=3)return{nivel:"medio",txt:"Risco Médio de Ferrugem",desc:"Condições parcialmente favoráveis. Monitore as folhas.",icon:"\uD83D\uDFE1"};return{nivel:"baixo",txt:"Risco Baixo de Ferrugem",desc:"Condições desfavoráveis para ferrugem hoje.",icon:"\uD83D\uDFE2"};}
// Risco de geada/friagem nas próximas 48h, com base na mínima prevista.
// Cafeeiro sofre dano a partir de ~3°C (queima de folhas) e dano severo/morte de ramos abaixo de 0°C.
function calcularRiscoGeada(minimaPrevista48h){
  if(minimaPrevista48h===null||minimaPrevista48h===undefined) return null;
  if(minimaPrevista48h<=0) return {nivel:"critico",txt:"Risco Crítico de Geada",desc:"Temperatura prevista igual ou abaixo de 0°C nas próximas 48h. Risco de morte de ramos e folhas. Considere irrigação por aspersão ou cobertura nas mudas.",icon:"\u2744\uFE0F"};
  if(minimaPrevista48h<=3) return {nivel:"alto",txt:"Risco Alto de Geada/Friagem",desc:"Mínima prevista de "+minimaPrevista48h+"°C nas próximas 48h. Risco de queima de folhas, especialmente em mudas e talhões em baixadas.",icon:"\u2744\uFE0F"};
  if(minimaPrevista48h<=6) return {nivel:"medio",txt:"Atenção: Temperatura Baixa",desc:"Mínima prevista de "+minimaPrevista48h+"°C. Sem risco direto de geada, mas fique atento à previsão.",icon:"\uD83D\uDD35"};
  return null;
}

function faseDaLua(data){
  var lp=29.53058867; // duração do ciclo lunar em dias
  var novaLuaRef=Date.UTC(2000,0,6,18,14,0)/1000; // nova lua de referência conhecida
  var diffDias=(data.getTime()/1000-novaLuaRef)/86400;
  var idade=diffDias%lp; if(idade<0)idade+=lp;
  var pos=idade/lp;
  var emojis=["\uD83C\uDF11","\uD83C\uDF12","\uD83C\uDF13","\uD83C\uDF14","\uD83C\uDF15","\uD83C\uDF16","\uD83C\uDF17","\uD83C\uDF18"];
  var idx=Math.round(pos*8)%8;
  return emojis[idx];
}
function obterIconeClima(wcode,ehDia){
  if(wcode<=1)return ehDia?"\u2600\uFE0F":faseDaLua(new Date());
  if(wcode<=3)return ehDia?"\u26C5":"\u2601\uFE0F";
  if(wcode<=49)return "\uD83C\uDF2B\uFE0F";
  if(wcode<=67)return "\uD83C\uDF27\uFE0F";
  if(wcode<=77)return "\u2744\uFE0F";
  if(wcode<=82)return "\uD83C\uDF26\uFE0F";
  return "\u26C8\uFE0F";
}
function obterClima(lat,lon){fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&forecast_days=3&timezone=America/Sao_Paulo").then(function(r){return r.json();}).then(function(d){var c=d.current,temp=Math.round(c.temperature_2m),umidade=Math.round(c.relative_humidity_2m),chuva=c.precipitation||0,wcode=c.weather_code,ehDia=c.is_day===1;var climaIcon=obterIconeClima(wcode,ehDia);var risco=calcularRiscoFerrugem(temp,umidade,chuva);
  var minima48h=null;
  if(d.daily&&d.daily.temperature_2m_min&&d.daily.temperature_2m_min.length>1){minima48h=Math.round(Math.min(d.daily.temperature_2m_min[0],d.daily.temperature_2m_min[1]));}
  var riscoGeada=calcularRiscoGeada(minima48h);
  var html='<div class="clima-topo"><span style="font-size:13px;font-weight:600;color:var(--marrom)">'+climaIcon+' Agora</span><span style="font-size:11px;color:var(--cinza)">Atualizado agora</span></div>';
  html+='<div class="clima-dados"><div class="clima-item"><div class="clima-valor">'+temp+'\u00b0C</div><div class="clima-label">Temperatura</div></div>';
  html+='<div class="clima-item"><div class="clima-valor">'+umidade+'%</div><div class="clima-label">Umidade</div></div>';
  html+='<div class="clima-item"><div class="clima-valor">'+chuva.toFixed(1)+'mm</div><div class="clima-label">Chuva</div></div></div>';
  if(riscoGeada){html+='<div class="risco-box risco-'+riscoGeada.nivel+'"><span class="risco-icon">'+riscoGeada.icon+'</span><div class="risco-info"><div class="risco-titulo">'+riscoGeada.txt+'</div><div class="risco-desc">'+riscoGeada.desc+'</div></div></div>';}
  html+='<div class="risco-box risco-'+risco.nivel+'"><span class="risco-icon">'+risco.icon+'</span><div class="risco-info"><div class="risco-titulo">'+risco.txt+'</div><div class="risco-desc">'+risco.desc+'</div></div></div>';
  if(d.daily&&d.daily.temperature_2m_max&&d.daily.temperature_2m_min&&d.daily.precipitation_probability_max){
    var dias=["Hoje","Amanhã","Depois"];
    html+='<div style="display:flex;gap:6px;margin:0 18px 14px;padding-top:8px;border-top:1px solid #f0ece4">';
    for(var i=0;i<Math.min(3,d.daily.temperature_2m_max.length);i++){
      var mx=Math.round(d.daily.temperature_2m_max[i]),mn=Math.round(d.daily.temperature_2m_min[i]),chance=d.daily.precipitation_probability_max[i];
      html+='<div style="flex:1;text-align:center;background:#faf8f5;border-radius:10px;padding:6px 4px"><div style="font-size:10px;color:var(--cinza);font-weight:600">'+dias[i]+'</div><div style="font-size:12px;font-weight:700;color:var(--marrom)">'+mx+'°/'+mn+'°</div><div style="font-size:10px;color:#4a90d9">\uD83D\uDCA7'+chance+'%</div></div>';
    }
    html+='</div>';
  }
  document.getElementById("cardClima").innerHTML=html;
}).catch(function(){document.getElementById("cardClima").innerHTML='<div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Clima não disponível</span></div>';});}

function obterPrecoCafe(){
  fetch("https://doutor-cafe-production.up.railway.app/preco-cafe").then(function(r){return r.json();}).then(function(d){
    if(d.erro){document.getElementById("cardPrecoCafe").innerHTML='<div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Preço indisponível no momento</span></div>';return;}
    var subiu=d.variacao_pontos>=0;
    var cor=subiu?"var(--verde)":"#c62828";
    var seta=subiu?"\u25B2":"\u25BC";
    var statusTxt=d.stale?"Dado anterior":"Atualizado agora";
    var html='<div class="clima-topo"><span style="font-size:13px;font-weight:600;color:var(--marrom)">\u2615 Caf\u00e9 NY (Coffee C)</span><span style="font-size:11px;color:var(--cinza)">'+statusTxt+'</span></div>';
    html+='<div class="clima-dados"><div class="clima-item"><div class="clima-valor">'+d.preco_ny_centavos_lb.toFixed(2)+'</div><div class="clima-label">Centavos/lb</div></div>';
    html+='<div class="clima-item"><div class="clima-valor" style="color:'+cor+'">'+seta+' '+Math.abs(d.variacao_pontos).toFixed(2)+'</div><div class="clima-label">Pontos hoje</div></div>';
    html+='<div class="clima-item"><div class="clima-valor" style="color:'+cor+'">'+(subiu?"+":"")+d.variacao_pct.toFixed(2)+'%</div><div class="clima-label">Variação</div></div></div>';
    var cambioTxt = (d.dolar!=null) ? ', câmbio R$'+d.dolar.toFixed(2) : '';
    html+='<div style="margin:0 18px 14px;padding-top:8px;border-top:1px solid #f0ece4;font-size:11px;color:var(--cinza);line-height:1.5">📊 Este é o <strong style="color:var(--marrom)">preço internacional de referência</strong> (Bolsa de Nova York)'+cambioTxt+'. O preço pago aqui no Brasil (CEPEA/ESALQ ou sua cooperativa) costuma ficar <strong>abaixo</strong> deste valor — a diferença cobre impostos, frete e margem até chegar no comprador local. Use este número para ver a <strong>tendência</strong> (se está subindo ou caindo), não como o preço exato da sua saca.</div>';
    html+='<a href="https://www.cepea.org.br/br/indicador/cafe.aspx" rel="noopener" style="display:block;margin:0 18px 18px;padding:10px 14px;background:#f5f1e8;border-radius:10px;text-align:center;font-size:12px;font-weight:600;color:var(--verde);text-decoration:none">💰 Ver preço real da saca (R$) — CEPEA/ESALQ oficial →</a>';
    document.getElementById("cardPrecoCafe").innerHTML=html;
  }).catch(function(){document.getElementById("cardPrecoCafe").innerHTML='<div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Preço indisponível no momento</span></div>';});
}

// ── CALENDÁRIO ──
var CALENDARIO={0:{fase:"granacao",faseTxt:"\uD83D\uDFE2 Granção",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — alta umidade favorece infecção"},{nivel:"alto",txt:"\uD83E\uDEB2 Bicho-mineiro — pico populacional"},{nivel:"medio",txt:"\uD83D\uDFE3 Mancha aureolada — ventos e chuvas"}],acoes:["\u2705 Aplicar fungicida preventivo para ferrugem","\u2705 Monitorar folhas para trilhas de bicho-mineiro","\u2705 Adubação de cobertura — N e K parcelados"]},1:{fase:"granacao",faseTxt:"\uD83D\uDFE2 Granção",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — período crítico"},{nivel:"alto",txt:"\uD83E\uDEB2 Bicho-mineiro — alta incidência"},{nivel:"medio",txt:"\uD83E\uDED9 Antracnose — chuvas intensas"}],acoes:["\u2705 Reaplicar fungicida (21 dias após última aplicação)","\u2705 Controle de bicho-mineiro se >30% folhas com minas","\u2705 Verificar adubação fosfatada"]},2:{fase:"maturacao",faseTxt:"\uD83D\uDD34 Maturação",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — frutos pesados reduzem resistência"},{nivel:"medio",txt:"\uD83D\uDD73\uFE0F Broca — monitorar frutos"},{nivel:"medio",txt:"\uD83E\uDEB2 Bicho-mineiro — continua ativo"}],acoes:["\u2705 Monitorar broca nos frutos","\u2705 Aplicar fungicida se necessário","\u2705 Preparar equipamentos para colheita"]},3:{fase:"colheita",faseTxt:"\u2615 Colheita",alertas:[{nivel:"medio",txt:"\uD83D\uDD73\uFE0F Broca — pico nos frutos maduros"},{nivel:"medio",txt:"\uD83D\uDFE0 Ferrugem — desfolha pós-colheita"},{nivel:"alto",txt:"\u26A0\uFE0F Colha no ponto certo — 80% frutos verdes = perda de 20 sacas a cada 100"}],acoes:["\u2705 Colheita seletiva — cereja e passa separados","\u2705 Controle biológico da broca (Beauveria bassiana)","\u2705 Processar café rapidamente após colheita","\u26A0\uFE0F Evite colheita antecipada — prejuízo no peso e qualidade"]},4:{fase:"colheita",faseTxt:"\u2615 Colheita",alertas:[{nivel:"medio",txt:"\uD83D\uDD73\uFE0F Broca — reinfestação em frutos remanescentes"},{nivel:"medio",txt:"\uD83D\uDFE0 Ferrugem — lesões visíveis pós-colheita"},{nivel:"alto",txt:"\u26A0\uFE0F 50% frutos verdes = perda de 13 sacas a cada 100"}],acoes:["\u2705 Recolher todos os frutos caídos (repasse)","\u2705 Aplicar fungicida curativo pós-colheita","\u2705 Iniciar poda de formação e limpeza","\u26A0\uFE0F Aguarde ponto ideal: mínimo 80% cereja/passa"]},5:{fase:"pos",faseTxt:"\uD83C\uDF3F Pós-colheita",alertas:[{nivel:"medio",txt:"\uD83D\uDFE0 Ferrugem — lesões tardias"},{nivel:"medio",txt:"\uD83D\uDFE1 Deficiência de Mg — período seco"}],acoes:["\u2705 Realizar poda e esqueletamento se necessário","\u2705 Calagem e adubação de solo","\u2705 Análise de solo para planejar próxima safra"]},6:{fase:"pos",faseTxt:"\uD83C\uDF3F Pós-colheita",alertas:[{nivel:"medio",txt:"\uD83D\uDFEB Ácaro vermelho — período seco favorece"},{nivel:"medio",txt:"\uD83D\uDFE1 Deficiências nutricionais — solo seco"}],acoes:["\u2705 Monitorar ácaros (folha bronzeada)","\u2705 Adubação fosfatada e potássica","\u2705 Irrigação se disponível"]},7:{fase:"repouso",faseTxt:"\uD83D\uDE34 Repouso vegetativo",alertas:[{nivel:"medio",txt:"\uD83D\uDFEB Ácaro vermelho — pico em período seco"},{nivel:"medio",txt:"\uD83E\uDD0D Cochonilha — favorecida pelo estresse hídrico"}],acoes:["\u2705 Aplicar acaricida se necessário","\u2705 Adubação foliar de micronutrientes","\u2705 Revisar sistema de irrigação"]},8:{fase:"florada",faseTxt:"\uD83C\uDF38 Florada",alertas:[{nivel:"alto",txt:"\uD83C\uDF38 NÃO aplicar inseticidas na florada — proteger abelhas"},{nivel:"medio",txt:"\uD83D\uDFE0 Ferrugem — início das chuvas"},{nivel:"medio",txt:"\u26AB Phoma — regiões acima de 900m"}],acoes:["\u26A0\uFE0F EVITAR agrotóxicos durante a florada","\u2705 Fungicida preventivo ANTES da florada","\u2705 Adubação nitrogenada de cobertura"]},9:{fase:"florada",faseTxt:"\uD83C\uDF38 Florada/Chumbinho",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — chuvas reiniciadas, risco alto"},{nivel:"alto",txt:"\uD83E\uDEB2 Bicho-mineiro — nova geração"},{nivel:"medio",txt:"\uD83D\uDFE3 Aureolada — ventos e chuvas"}],acoes:["\u2705 Aplicar fungicida sistêmico para ferrugem","\u2705 Monitorar bicho-mineiro nas folhas novas","\u2705 Adubação NPK completa"]},10:{fase:"granacao",faseTxt:"\uD83D\uDFE2 Granção",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — período de máximo risco"},{nivel:"alto",txt:"\uD83E\uDEB2 Bicho-mineiro — alta infestação"},{nivel:"medio",txt:"\u26AB Phoma — em regiões altas"}],acoes:["\u2705 Reaplicar fungicida (intervalo 21 dias)","\u2705 Controle de bicho-mineiro","\u2705 Monitorar deficiência de boro nos ponteiros"]},11:{fase:"granacao",faseTxt:"\uD83D\uDFE2 Granção",alertas:[{nivel:"alto",txt:"\uD83D\uDFE0 Ferrugem — frutos em desenvolvimento"},{nivel:"alto",txt:"\uD83E\uDEB2 Bicho-mineiro — pico"},{nivel:"medio",txt:"\uD83D\uDFE3 Aureolada — ventos de verão"}],acoes:["\u2705 Fungicida preventivo — não deixar passar intervalo","\u2705 Adubação potássica para granção","\u2705 Monitorar broca nos primeiros frutos"]}};
function renderCalendario(){var mes=new Date().getMonth(),cal=CALENDARIO[mes];var html='<div class="cal-header"><div class="cal-mes">\uD83D\uDCC5 '+MESES[mes]+'</div><div class="cal-fase fase-'+cal.fase+'">'+cal.faseTxt+'</div></div>';html+='<div class="cal-divisor"></div><div class="cal-alertas"><h4>\u26A0\uFE0F Alertas deste mês</h4>';cal.alertas.forEach(function(a){html+='<div class="alerta-item"><span class="alerta-'+a.nivel+'">'+a.txt+'</span></div>';});html+='</div><div class="cal-divisor"></div><div class="cal-acoes"><h4>\uD83D\uDCCB O que fazer agora</h4>';cal.acoes.forEach(function(a){html+='<div class="acao-item">'+a+'</div>';});html+='</div>';document.getElementById("cardCalendario").innerHTML=html;}

function salvarHistorico(diags,fotoBase64,regiao){try{var hist=JSON.parse(localStorage.getItem(HIST_KEY)||"[]");var agora=new Date();var data=agora.getDate()+"/"+(agora.getMonth()+1)+"/"+agora.getFullYear()+" "+agora.getHours()+":"+String(agora.getMinutes()).padStart(2,"0");var primeiro=diags[0];hist.unshift({diag:primeiro.diagnostico,emoji:EMOJIS[primeiro.diagnostico]||"\uD83C\uDF3F",diags:diags,data:data,regiao:regiao||"",foto:fotoBase64||null});if(hist.length>10)hist=hist.slice(0,10);localStorage.setItem(HIST_KEY,JSON.stringify(hist));}catch(e){}criarLembretesReaplicacao(diags);renderAreaHistorico();}

// ── LEMBRETES DE REAPLICAÇÃO ─────────────────────────────────
// Usa o intervalo_reaplicacao de cada fungicida recomendado para criar um
// lembrete local. Checado toda vez que o app abre (ver checarLembretesPendentes).
var LEMBRETES_KEY="doutorcafe_lembretes";
function criarLembretesReaplicacao(diags){
  try{
    var lembretes=JSON.parse(localStorage.getItem(LEMBRETES_KEY)||"[]");
    var agora=new Date();
    diags.forEach(function(d){
      if(!d.fungicidas||d.fungicidas.length===0)return;
      d.fungicidas.forEach(function(f){
        if(!f.intervalo_reaplicacao)return;
        var dataAlvo=new Date(agora.getTime()+f.intervalo_reaplicacao*24*60*60*1000);
        lembretes.push({
          produto:f.nome_comercial||f.nome,
          doenca:d.diagnostico,
          dataAlvo:dataAlvo.toISOString(),
          criadoEm:agora.toISOString(),
          notificado:false
        });
      });
    });
    if(lembretes.length>30)lembretes=lembretes.slice(-30);
    localStorage.setItem(LEMBRETES_KEY,JSON.stringify(lembretes));
  }catch(e){}
}
function checarLembretesPendentes(){
  try{
    var lembretes=JSON.parse(localStorage.getItem(LEMBRETES_KEY)||"[]");
    var agora=new Date();
    var pendentes=lembretes.filter(function(l){return !l.notificado&&new Date(l.dataAlvo)<=agora;});
    if(pendentes.length===0)return;
    var nomes=pendentes.map(function(l){return l.produto;}).filter(function(v,i,a){return a.indexOf(v)===i;});
    var msg=pendentes.length===1
      ?"\u23F0 Hora de reaplicar "+nomes[0]+"!"
      :"\u23F0 Hora de reaplicar: "+nomes.join(", ")+".";
    setTimeout(function(){alert(msg+"\n\nVerifique o intervalo de carência antes de aplicar.");},800);
    lembretes.forEach(function(l){if(!l.notificado&&new Date(l.dataAlvo)<=agora)l.notificado=true;});
    localStorage.setItem(LEMBRETES_KEY,JSON.stringify(lembretes));
  }catch(e){}
}

// ── GPS ──
var dadosGPS={lat:null,lon:null,regiao:null,altitude:null};
var _analiseEmAndamento=false;
function travarAnalise(){
  if(_analiseEmAndamento){return false;}
  _analiseEmAndamento=true;
  return true;
}
function destravarAnalise(){_analiseEmAndamento=false;}
function identificarRegiao(lat,lon){if(lat>=-20.5&&lat<=-15.0&&lon>=-50.0&&lon<=-44.0)return "Cerrado Mineiro";if(lat>=-22.5&&lat<=-19.5&&lon>=-46.5&&lon<=-43.5)return "Sul de Minas";if(lat>=-21.5&&lat<=-19.0&&lon>=-48.5&&lon<=-46.0)return "Mogiana";if(lat>=-20.0&&lat<=-17.0&&lon>=-42.5&&lon<=-40.0)return "Matas de Minas";if(lat>=-15.0&&lat<=-10.0&&lon>=-41.5&&lon<=-38.5)return "Chapada Diamantina";if(lat>=-12.0&&lat<=-8.0&&lon>=-40.0&&lon<=-36.0)return "Planalto da Bahia";if(lat>=-12.0&&lat<=-6.0&&lon>=-62.0&&lon<=-56.0)return "Rondônia";if(lat>=-22.0&&lat<=-19.0&&lon>=-52.0&&lon<=-48.0)return "Alta Paulista";if(lat>=-25.0&&lat<=-21.0&&lon>=-54.0&&lon<=-49.0)return "Norte do Paraná";if(lat>=-21.0&&lat<=-17.0&&lon>=-41.5&&lon<=-39.0)return "Espírito Santo";return "Região Cafeeira";}
function obterGPS(){if(!navigator.geolocation){document.getElementById("regiaoTag").textContent="\uD83D\uDCCD GPS não disponível";return;}navigator.geolocation.getCurrentPosition(function(pos){dadosGPS.lat=pos.coords.latitude;dadosGPS.lon=pos.coords.longitude;dadosGPS.altitude=pos.coords.altitude?Math.round(pos.coords.altitude):null;dadosGPS.regiao=identificarRegiao(dadosGPS.lat,dadosGPS.lon);var tag="\uD83D\uDCCD "+dadosGPS.regiao;if(dadosGPS.altitude)tag+=" \u00b7 "+dadosGPS.altitude+"m";document.getElementById("regiaoTag").textContent=tag;obterClima(dadosGPS.lat,dadosGPS.lon);},function(){document.getElementById("regiaoTag").textContent="\uD83D\uDCCD Localização não obtida";document.getElementById("cardClima").innerHTML='<div class="clima-topo"><span style="font-size:13px;color:var(--cinza)">Ative o GPS para ver o clima</span></div>';},{timeout:8000,enableHighAccuracy:false});}

// ── CALCULADORA FUNGICIDA ──
function formulacaoDoNome(nome){
  if(/\bWG\b/i.test(nome))return{passo:2,label:"Pós molhável (WG)"};
  if(/\bWP\b/i.test(nome))return{passo:2,label:"Pós molhável (WP)"};
  if(/\bSC\b/i.test(nome))return{passo:3,label:"Suspensão concentrada (SC)"};
  if(/\bEC\b/i.test(nome))return{passo:4,label:"Concentrado emulsionável (EC)"};
  return null;
}
function buildCalcFungicida(fungicidas,diagIdx){if(!fungicidas||fungicidas.length===0)return "";var html='<div class="calc-box"><div class="calc-titulo">\uD83E\uDDEA Calcular Dosagem</div>';var passosUsados={};var temProtetor=false,temSistemico=false;fungicidas.forEach(function(f,fi){var badgeClass="calc-tipo-"+(f.tipo||"protetor");var badgeTxt=f.tipo==="sistemico"?"Sistêmico":f.tipo==="biologico"?"Biológico":f.tipo==="acaricida"?"Acaricida":f.tipo==="inseticida"?"Inseticida":"Protetor";if(f.tipo==="sistemico")temSistemico=true;else if(!f.tipo||f.tipo==="protetor")temProtetor=true;var inputId="calc_"+diagIdx+"_"+fi;var resTanque=(f.proporcao_por_litro*20).toFixed(1);var fmt=formulacaoDoNome(f.nome);var passoTxt="";if(fmt){passosUsados[fmt.passo]=f.nome;passoTxt='<div style="font-size:11px;color:#1a5c2a;margin-top:4px">\uD83D\uDCCB Este produto entra no <strong>passo '+fmt.passo+'</strong> da mistura (veja a ordem completa abaixo)</div>';}html+='<div class="calc-produto"><div class="calc-produto-nome">\uD83E\uDDF4 '+f.nome+' <span class="calc-tipo-badge '+badgeClass+'">'+badgeTxt+'</span></div>';html+='<div class="calc-inputs"><div class="calc-input-group"><label>Área (hectares)</label><input type="number" id="'+inputId+'_ha" value="1" min="0.1" step="0.1" oninput="calcular(\''+inputId+'\','+f.dose_min+','+f.dose_max+','+f.proporcao_por_litro+',\''+f.unidade+'\',\''+(f.unidade_proporcao||'g')+'\')"></div>';html+='<div class="calc-input-group"><label>Tanque (litros)</label><input type="number" id="'+inputId+'_tanque" value="20" min="1" step="1" oninput="calcular(\''+inputId+'\','+f.dose_min+','+f.dose_max+','+f.proporcao_por_litro+',\''+f.unidade+'\',\''+(f.unidade_proporcao||'g')+'\')"></div></div>';html+='<div class="calc-resultado" id="'+inputId+'_res"><div class="calc-resultado-linha"><span class="calc-resultado-label">Dose total no hectare</span><span class="calc-resultado-valor">'+f.dose_min+'\u2013'+f.dose_max+' '+f.unidade+'</span></div><div class="calc-resultado-linha"><span class="calc-resultado-label">Por tanque de 20L</span><span class="calc-resultado-valor">'+resTanque+' '+(f.unidade_proporcao||'g')+'</span></div><div class="calc-aviso">\u26A0\uFE0F Confirme sempre no rótulo do produto comprado</div></div>'+passoTxt+'</div>';});
  var passos=[{n:1,txt:"Encher o pulverizador com 1/3 de água"},{n:2,txt:"Colocar primeiro os produtos em PÓ (rótulo diz WP ou WG)"},{n:3,txt:"Depois os produtos líquidos tipo leite (rótulo diz SC)"},{n:4,txt:"Depois os produtos líquidos oleosos (rótulo diz EC)"},{n:5,txt:"Completar com o resto da água e agitar bem"}];
  var mistHtml='<div class="ordem-mistura"><strong>📋 Ordem de mistura no tanque:</strong><br>';
  passos.forEach(function(p){var extra=passosUsados[p.n]?' <strong>\u2190 '+passosUsados[p.n]+'</strong>':'';mistHtml+=p.n+'\u00ba '+p.txt+extra+'<br>';});
  mistHtml+='</div>';
  if(temProtetor&&temSistemico){mistHtml+='<div style="margin-top:8px;font-size:11px;color:#5a6b5c;line-height:1.5">\uD83D\uDCA1 <strong>Por que dois produtos?</strong> O <em>protetor</em> fica na superfície da folha e lava com a chuva (por isso precisa reaplicar mais vezes). O <em>sistêmico</em> entra na planta e dura mais, mas sozinho pode fazer a doença criar resistência. Por isso os dois juntos funcionam melhor.</div>';}
  html+=mistHtml+'</div>';return html;}
function calcular(inputId,doseMin,doseMax,propPorLitro,unidade,unidadeProp){var haEl=document.getElementById(inputId+"_ha"),tanqueEl=document.getElementById(inputId+"_tanque"),resEl=document.getElementById(inputId+"_res");if(!haEl||!tanqueEl||!resEl)return;var ha=parseFloat(haEl.value)||1,tanque=parseFloat(tanqueEl.value)||20;resEl.innerHTML='<div class="calc-resultado-linha"><span class="calc-resultado-label">Dose total ('+ha+' ha)</span><span class="calc-resultado-valor">'+(doseMin*ha).toFixed(2)+'\u2013'+(doseMax*ha).toFixed(2)+' '+unidade+'</span></div><div class="calc-resultado-linha"><span class="calc-resultado-label">Por tanque de '+tanque+'L</span><span class="calc-resultado-valor">'+(propPorLitro*tanque).toFixed(1)+' '+unidadeProp+'</span></div><div class="calc-aviso">\u26A0\uFE0F Confirme sempre no rótulo do produto comprado</div>';}

// ── REDIMENSIONAR IMAGEM ANTES DO UPLOAD ──
// Reduz a foto da câmera (geralmente 3000-4000px) para no máximo maxDim no lado maior,
// recomprime em JPEG e retorna só o base64 (sem o prefixo data:). Isso corta drasticamente
// os tokens de entrada cobrados pela API por imagem, sem perda perceptível de qualidade
// de diagnóstico. Em caso de falha (ex: arquivo corrompido), cai no base64 original.
function redimensionarImagem(file, maxDim, qualidade, callback) {
  var leitor = new FileReader();
  leitor.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      var b64;
      try { b64 = canvas.toDataURL("image/jpeg", qualidade).split(",")[1]; }
      catch(err) { b64 = e.target.result.split(",")[1]; }
      callback(b64);
    };
    img.onerror = function() { callback(e.target.result.split(",")[1]); };
    img.src = e.target.result;
  };
  leitor.onerror = function() { callback(null); };
  leitor.readAsDataURL(file);
}

// ── PROCESSAR ARQUIVOS ──
// CORREÇÃO 3: removido `talhaoAtual = null` prematuro — era zerado antes do fetch terminar
function processar(file, isVideo) {
  if(!travarAnalise())return;
  if (!servidorAcordado) acordarServidor(null);
  document.getElementById("spinner").style.display="block";
  document.getElementById("resultado").style.display="none";
  document.getElementById("spinnerTexto").textContent="Analisando...";
  document.getElementById("spinnerSub").textContent="Identificando sintomas — resultado em ~15 segundos";
  redimensionarImagem(file, 1280, 0.95, function(b64) {
    ultimaFotoBase64=b64;
    var body={imagem:b64,tipo:"image/jpeg"};
    if (dadosGPS.regiao) body.regiao=dadosGPS.regiao;
    if (dadosGPS.altitude) body.altitude=dadosGPS.altitude;
    if (usuarioAtual && usuarioAtual.userId) body.userId=usuarioAtual.userId;
    var diagsSSE = [];
    var fimProcessado = false;
    // Capturar talhaoId AGORA em closure — não depender do localStorage durante o SSE
    var talhaoIdCapturado = localStorage.getItem("dc_analise_talhao_id") || null;

    function finalizarAnalise(diags) {
      if(fimProcessado) return;
      fimProcessado = true;
      destravarAnalise();
      diags = diags.map(function(d){ return Object.assign({},d,{parcial:false}); });
      // Salvar no talhão usando o ID capturado no início da análise
      if(talhaoIdCapturado){
        try{
          var tsArr=JSON.parse(localStorage.getItem("dc_talhoes_v1")||"[]");
          for(var qx=0;qx<tsArr.length;qx++){
            if(tsArr[qx].id===talhaoIdCapturado){
              if(!tsArr[qx].analises) tsArr[qx].analises=[];
              tsArr[qx].analises.unshift({id:"a_"+Date.now(),data:new Date().toISOString(),fotoFull:b64,diagnosticos:diags,statusAcao:"pendente"});
              localStorage.setItem("dc_talhoes_v1",JSON.stringify(tsArr));
              localStorage.removeItem("dc_analise_talhao_id");
              talhaoAtual=null;
              setTimeout(renderTalhoes,100);
              break;
            }
          }
        }catch(eTalhao){console.error("Talhao save err:",eTalhao);}
      }
      // Salvar histórico UMA ÚNICA VEZ com dados completos
      salvarHistorico(diags,b64,dadosGPS.regiao||"");
      // Sync análise com servidor em background
      var cadSync=verificarCadastroInicial();
      if(cadSync&&cadSync.userId){
        var fotoThumb=b64?b64.substring(0,200):"";
        fetch('https://doutor-cafe-production.up.railway.app/salvar-analise',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({userId:cadSync.userId,talhaoId:talhaoIdCapturado||null,diagnosticos:diags,fotoThumb:fotoThumb,regiao:dadosGPS.regiao||""})
        }).catch(function(){});
        // Sync talhão atualizado se houver
        if(talhaoIdCapturado){
          var ts=getTalhoes();var t=ts.find(function(x){return x.id===talhaoIdCapturado;});
          if(t) fetch('https://doutor-cafe-production.up.railway.app/salvar-talhao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:cadSync.userId,talhao:t})}).catch(function(){});
        }
      }
      document.getElementById("spinner").style.display="none";
      mostrarResultadoStreaming(diags,b64,isVideo);
      incrementarAnalise();
      var ok=diags.every(function(d){return d.diagnostico==="saudavel";});
      if(diags.length>0&&!ok){
        var bp={diagnosticos:diags}; if(dadosGPS.regiao) bp.regiao=dadosGPS.regiao;
        fetch("https://doutor-cafe-production.up.railway.app/plano-acao",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(bp)})
        .then(function(r2){return r2.json();})
        .then(function(plano){
          var ct=document.getElementById("planoAcaoContainer");
          if(ct&&plano&&(plano.urgente||plano.resumo_geral)){
            _ultimoPlano=plano;
            var ph=buildPlanoAcao(plano);
            if(ph){ct.innerHTML=ph;ct.style.animation="slideUp 0.4s ease";}
            if(plano.urgente) _textoParaFalar+=" Esta semana: "+plano.urgente+".";
            if(plano.em_21_dias) _textoParaFalar+=" Em 21 dias: "+plano.em_21_dias+".";
          }
        }).catch(function(){});
      }
    }
    fetch("https://doutor-cafe-production.up.railway.app/diagnostico",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    })
    .then(function(r){
      var Readable = (typeof ReadableStream !== 'undefined') ? null : null;
      var reader2 = r.body.getReader(), dec=new TextDecoder(), sseBuf="";
      function processarEventos(buf){
        // Dividir por \n\n — cada bloco SSE é um evento completo
        var eventos=buf.split("\n\n");
        eventos.forEach(function(bloco){
          bloco.split("\n").forEach(function(linha){
            if(linha.startsWith(":")) return;
            if(!linha.startsWith("data: ")) return;
            var jsonStr=linha.slice(6).trim();
            if(!jsonStr) return;
            try {
              var ev=JSON.parse(jsonStr);
              if(ev.tipo==="diag"){
                diagsSSE.push(ev.diag);
                document.getElementById("spinner").style.display="none";
                try { mostrarResultadoStreaming(diagsSSE,b64,isVideo); } catch(err) {}
              } else if(ev.tipo==="diag_completo"){
                if(ev.index<diagsSSE.length) diagsSSE[ev.index]=ev.diag; else diagsSSE.push(ev.diag);
                mostrarResultadoStreaming(diagsSSE,b64,isVideo);
              } else if(ev.tipo==="fim"){
                var dF=(ev.resultado&&ev.resultado.diagnosticos)||[];
                var fb=dF.length===1&&dF[0].diagnostico==="saudavel"&&dF[0].confianca==="baixa";
                var diags;
                if(fb&&diagsSSE.length>0){
                  diags=diagsSSE;
                } else if(dF.length>0){
                  diags=dF.map(function(df,idx){
                    var sse=diagsSSE[idx];
                    if(df.acao&&df.acao.length>5&&!df.parcial) return df;
                    if(sse&&sse.acao&&sse.acao.length>5&&!sse.parcial) return sse;
                    return Object.assign({},sse||{},df,{
                      acao:(df.acao&&df.acao.length>5&&df.acao!=="Analisando...")?df.acao:(sse&&sse.acao&&sse.acao!=="Analisando..."?sse.acao:""),
                      fungicidas:(df.fungicidas&&df.fungicidas.length>0)?df.fungicidas:(sse&&sse.fungicidas?sse.fungicidas:[]),
                      visto:df.visto||(sse&&sse.visto)||"",
                      parcial:false
                    });
                  });
                } else {
                  diags=diagsSSE;
                }
                finalizarAnalise(diags);
              }
            } catch(e){ /* JSON incompleto — ignorar, virá no próximo chunk */ }
          });
        });
      }
      function ler(){
        reader2.read().then(function(res2){
          if(res2.done){
            // Processar buffer restante
            if(sseBuf.trim()) processarEventos(sseBuf);
            // Se tipo:fim não chegou — buscar resultado completo via JSON
            if(!fimProcessado){
              if(diagsSSE.length>0){
                // Temos parciais — buscar completo no servidor
                fetch("https://doutor-cafe-production.up.railway.app/diagnostico-json",{
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body:JSON.stringify(body)
                })
                .then(function(r3){return r3.json();})
                .then(function(data){
                  var dF=data.diagnosticos||[];
                  if(dF.length>0){
                    // Mesclar com os parciais que já temos na tela
                    var diags=dF.map(function(df,idx){
                      var sse=diagsSSE[idx];
                      return Object.assign({},sse||{},df,{parcial:false});
                    });
                    finalizarAnalise(diags);
                  } else {
                    finalizarAnalise(diagsSSE);
                  }
                })
                .catch(function(){
                  // Se o JSON também falhar, usar parciais mesmo
                  finalizarAnalise(diagsSSE);
                });
              } else {
                destravarAnalise();
                document.getElementById("spinner").style.display="none";
                mostrarErro();
              }
            }
            return;
          }
          sseBuf+=dec.decode(res2.value,{stream:true});
          // Processar apenas eventos completos (terminados com \n\n)
          var posUltimoEvento=sseBuf.lastIndexOf("\n\n");
          if(posUltimoEvento>=0){
            var blocoCompleto=sseBuf.substring(0,posUltimoEvento+2);
            sseBuf=sseBuf.substring(posUltimoEvento+2);
            processarEventos(blocoCompleto);
          }
          ler();
        }).catch(function(){});
      }
      ler();
    })
    .catch(function(){
      destravarAnalise();
      document.getElementById("spinner").style.display="none";
      adicionarNaFila(b64,null,"folha",function(ok){ if(ok){renderAreaHistorico();alert("Sem conexão estável. Foto salva na fila offline com o talhão selecionado!");} });
    });
  });
}

function processarSolo(file){if(!travarAnalise())return;if(!servidorAcordado)acordarServidor(null);document.getElementById("spinner").style.display="block";document.getElementById("resultado").style.display="none";document.getElementById("spinnerTexto").textContent="Lendo laudo de solo...";document.getElementById("spinnerSub").textContent="Interpretando valores e calculando recomendações";redimensionarImagem(file,1600,0.85,function(b64){ultimaFotoBase64=b64;var body={imagem:b64,tipo:"image/jpeg"};if(dadosGPS.regiao)body.regiao=dadosGPS.regiao;if(usuarioAtual&&usuarioAtual.userId)body.userId=usuarioAtual.userId;fetchComRetry("https://doutor-cafe-production.up.railway.app/analise-solo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},TIMEOUT_MS).then(function(r){return r.json();}).then(function(data){destravarAnalise();document.getElementById("spinner").style.display="none";mostrarResultadoSolo(data);incrementarAnalise();}).catch(function(){destravarAnalise();document.getElementById("spinner").style.display="none";adicionarNaFila(b64,null,"solo",function(ok){if(ok){renderAreaHistorico();alert("Sem conexão estável. Laudo salvo na fila offline!");}else{mostrarErro();}});});});}
function processarDaninha(file){if(!travarAnalise())return;if(!servidorAcordado)acordarServidor(null);document.getElementById("spinner").style.display="block";document.getElementById("resultado").style.display="none";document.getElementById("spinnerTexto").textContent="Identificando planta daninha...";document.getElementById("spinnerSub").textContent="Lendo o que ela revela sobre o seu solo";redimensionarImagem(file,1280,0.92,function(b64){ultimaFotoBase64=b64;var body={imagem:b64,tipo:"image/jpeg"};if(dadosGPS.regiao)body.regiao=dadosGPS.regiao;if(usuarioAtual&&usuarioAtual.userId)body.userId=usuarioAtual.userId;fetchComRetry("https://doutor-cafe-production.up.railway.app/identifica-daninha",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},TIMEOUT_MS).then(function(r){return r.json();}).then(function(data){destravarAnalise();document.getElementById("spinner").style.display="none";mostrarResultadoDaninha(data);incrementarAnalise();}).catch(function(){destravarAnalise();document.getElementById("spinner").style.display="none";adicionarNaFila(b64,null,"daninha",function(ok){if(ok){renderAreaHistorico();alert("Sem conexão estável. Foto salva na fila offline!");}else{mostrarErro();}});});});}
function processarVideo(file){if(!travarAnalise())return;document.getElementById("spinner").style.display="block";document.getElementById("resultado").style.display="none";document.getElementById("spinnerTexto").textContent="Extraindo frames do vídeo...";document.getElementById("spinnerSub").textContent="Analisando múltiplos ângulos";var video=document.createElement("video"),canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d"),url=URL.createObjectURL(file);video.src=url;video.muted=true;video.addEventListener("loadedmetadata",function(){var duration=video.duration,frames=[],tempos=[duration*0.15,duration*0.35,duration*0.60,duration*0.85],idx=0;function capturarFrame(){if(idx>=tempos.length){URL.revokeObjectURL(url);enviarFrames(frames);return;}video.currentTime=tempos[idx];}video.addEventListener("seeked",function(){canvas.width=640;canvas.height=480;ctx.drawImage(video,0,0,640,480);var frameB64=canvas.toDataURL("image/jpeg",0.7).split(",")[1];if(idx===0)ultimaFotoBase64=frameB64;frames.push(frameB64);idx++;capturarFrame();});capturarFrame();});video.load();video.addEventListener("error",function(){destravarAnalise();document.getElementById("spinner").style.display="none";alert("Não foi possível ler o vídeo. Tente gravar novamente.");});}
function enviarFrames(frames){if(!servidorAcordado)acordarServidor(null);document.getElementById("spinnerTexto").textContent="Analisando "+frames.length+" ângulos...";var body={frames:frames,tipo:"image/jpeg"};if(dadosGPS.regiao)body.regiao=dadosGPS.regiao;if(dadosGPS.altitude)body.altitude=dadosGPS.altitude;if(usuarioAtual&&usuarioAtual.userId)body.userId=usuarioAtual.userId;fetchComRetry("https://doutor-cafe-production.up.railway.app/diagnostico-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},TIMEOUT_MS).then(function(r){return r.json();}).then(function(data){destravarAnalise();document.getElementById("spinner").style.display="none";if(data.semVideos){alert("Você atingiu o limite de vídeos do seu plano este mês.\nDica: use a câmera de foto para continuar diagnosticando.");atualizarBadgeVideo();return;}if(data.semAnalises){alert("Limite de análises do plano atingido. Faça upgrade para continuar.");abrirModal(true);return;}if(data.erro){alert("Erro: "+data.erro);return;}mostrarResultado(data,true);incrementarAnalise();if(usuarioAtual&&usuarioAtual.userId){fetch("https://doutor-cafe-production.up.railway.app/incrementar-video",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:usuarioAtual.userId})}).then(function(){var v=parseInt(localStorage.getItem("doutorcafe_videos_usados")||"0");localStorage.setItem("doutorcafe_videos_usados",(v+1).toString());atualizarBadgeVideo();}).catch(function(){});}}).catch(function(){destravarAnalise();document.getElementById("spinner").style.display="none";adicionarNaFila(frames[0],frames,"video",function(ok){if(ok){renderAreaHistorico();document.getElementById("areaHistorico").scrollIntoView({behavior:"smooth",block:"start"});alert("Sem conexão. Vídeo salvo na fila!");}});});}

// ── COMPARTILHAR ──
function compartilharAtual(){var texto="🌿 *Doutor Café — Diagnóstico*\n";if(dadosGPS.regiao)texto+="📍 "+dadosGPS.regiao+"\n";texto+="\n";var doencas=(_ultimosDiags||[]).filter(function(d){return d.diagnostico!=="saudavel";});if(doencas.length>0){texto+="🔬 *"+doencas.length+" problema(s) detectado(s):*\n";doencas.forEach(function(d){var emoji=EMOJIS[d.diagnostico]||"🌿";var nome=NOMES_VOZ[d.diagnostico]||d.diagnostico.replace(/_/g," ");texto+=emoji+" "+nome+" — Estágio "+(d.estagio||1)+"/5\n";});texto+="\n";}if(_ultimoPlano){texto+="📋 *Plano de Ação:*\n";if(_ultimoPlano.urgente)texto+="🔴 *Esta semana:* "+_ultimoPlano.urgente+"\n";if(_ultimoPlano.em_21_dias)texto+="🟡 *Em 21 dias:* "+_ultimoPlano.em_21_dias+"\n";if(_ultimoPlano.nutricao)texto+="🟢 *Nutrição:* "+_ultimoPlano.nutricao+"\n";texto+="\n";}texto+="_Diagnóstico realizado pelo app Doutor Café_";window.open("https://wa.me/?text="+encodeURIComponent(texto),"_blank");}

// ── MOSTRAR RESULTADOS ──
var _textoParaFalar = "";
var _ultimosDiags = [];
var _ultimoPlano = null;

function mostrarResultadoStreaming(diags,fotoBase64,isVideo){
  var div=document.getElementById("resultado");
  div.style.display="block";
  var regiao=dadosGPS.regiao||"";
  // Preservar plano de ação já renderizado (não destruir ao re-renderizar durante stream)
  var planoHtmlSalvo="";
  var ctExistente=document.getElementById("planoAcaoContainer");
  if(ctExistente&&ctExistente.innerHTML) planoHtmlSalvo=ctExistente.innerHTML;

  var thumbHtml=fotoBase64?'<img class="multi-foto" src="data:image/jpeg;base64,'+fotoBase64+'" alt="foto">':"<div class='multi-foto-placeholder'>🌿</div>";
  var qtd=diags.length>1?diags.length+" problemas detectados":"1 diagnóstico";
  var html='<div class="card-resultado"><div class="multi-header">'+thumbHtml+'<div class="multi-titulo"><h3>Resultado da Análise</h3><p>'+qtd;
  if(regiao)html+=' · 📍 '+regiao;
  if(isVideo)html+=' · 🎥 Vídeo';
  html+='</p></div></div>';
  html+=buildResumo(diags);
  html+='<div id="planoAcaoContainer">'+planoHtmlSalvo+'</div>';
  diags.forEach(function(d,diagIdx){
    var diag=d.diagnostico||"saudavel",estagio=d.estagio||1,confianca=d.confianca||"media";
    var badgeTexto=confianca==="alta"?"✓ Alta":confianca==="media"?"~ Média":"! Baixa";
    var barras="";for(var i=1;i<=5;i++)barras+='<div class="diag-seg" style="background:'+(i<=estagio?CORES_ESTAGIO[estagio-1]:"#e8e8e8")+'"></div>';
    html+='<div class="diag-item" style="animation:slideUp 0.4s ease"><div class="diag-item-topo"><span style="font-size:28px">'+(EMOJIS[diag]||"🌿")+'</span><div><div class="diag-nome">'+diag.replace(/_/g," ")+'</div><div class="diag-cat">'+(CATEGORIAS[diag]||"Análise")+'</div></div></div>';
    html+='<div class="diag-badges"><span class="badge badge-estagio">📊 Estágio '+estagio+'/5</span><span class="badge badge-confianca-'+confianca+'">'+badgeTexto+' confiança</span></div>';
    html+='<div class="diag-bar">'+barras+'</div>';
    if(d.visto)html+='<div class="diag-visto">"'+d.visto+'"</div>';
    if(d.parcial){
      html+='<div class="diag-acao" style="color:#aaa;font-style:italic">⏳ Analisando...</div>';
    }else{
      html+='<div class="diag-acao">'+(d.acao||"")+'</div>';
      if(d.fungicidas&&d.fungicidas.length>0)html+=buildCalcFungicida(d.fungicidas,diagIdx);
      if(diag!=="saudavel"&&(confianca==="baixa"||confianca==="media")){
        var ehNutricional=(CATEGORIAS[diag]||"").toLowerCase().indexOf("nutri")>-1;
        var textoConfirmar;
        if(ehNutricional){
          textoConfirmar=confianca==="baixa"
            ?'🔎 <strong>Sinal inicial.</strong> Para confirmar esta deficiência com segurança, faça uma análise de solo ou foliar antes de aplicar doses maiores.'
            :'🔎 <strong>Para dose exata:</strong> uma análise de solo ou foliar confirma esta deficiência e evita aplicar a mais ou a menos.';
        }else{
          textoConfirmar=confianca==="baixa"
            ?'🔎 <strong>Sinal inicial — confirme antes de tratar.</strong> Fotografe também a face de baixo da folha e refaça a análise em 5–7 dias para ver se o sintoma evolui. Se possível, confirme com um técnico antes de aplicar defensivo.'
            :'🔎 <strong>Vale confirmar:</strong> fotografe também a face de baixo da folha e observe a evolução nos próximos dias para ter mais certeza antes de aplicar.';
        }
        html+='<div class="aviso-confirmar">'+textoConfirmar+'</div>';
      }
    }
    html+='</div>';
  });
  var naoSaudavel=diags.filter(function(d){return d.diagnostico!=="saudavel";});
  var nomesVoz=naoSaudavel.map(function(d){return NOMES_VOZ[d.diagnostico]||d.diagnostico.replace(/_/g," ");}).join(", ");
  var textoVoz=naoSaudavel.length>0?"Sua planta tem: "+nomesVoz+". ":"Planta saudável. ";
  textoVoz+=naoSaudavel.map(function(d){return d.acao;}).filter(Boolean).join(". ");
  _textoParaFalar=textoVoz;
  html+='<div class="disclaimer-legal">💡 <strong>Use para agir rápido:</strong> identifique o problema agora e chegue mais preparado numa visita do Engenheiro Agrônomo — a aplicação de defensivos exige Receituário Agronômico (MAPA/CREA) por lei.</div>';
  html+='<div class="btns-resultado"><button class="btn-voz" onclick="falarTextoAtual()">🔊 Ouvir</button>';
  html+='<button class="btn-share" onclick="compartilharAtual()">📤 WhatsApp</button>';
  html+='<button class="btn-nova" onclick="resetar()">📷 Nova</button></div>';
  html+='<button onclick="trocarTalhaoAposAnalise()" style="width:calc(100% - 40px);margin:0 20px 20px;padding:11px;background:white;color:#2d8a3e;border:2px solid #c8ddc8;border-radius:14px;font-size:13px;font-weight:700;cursor:pointer">🌿 Trocar Talhão</button>';
  html+='</div>';
  div.innerHTML=html;
  // NÃO salvar histórico aqui — só salvar uma vez no tipo:"fim" após dados completos
  _ultimosDiags=diags;
}

function mostrarResultado(data,isVideo){var div=document.getElementById("resultado");div.style.display="block";var diags=data.diagnosticos||[{diagnostico:data.diagnostico||"saudavel",estagio:data.estagio||1,confianca:data.confianca||"media",visto:data.visto||"",acao:data.acao||"Tente novamente.",fungicidas:[]}];var regiao=dadosGPS.regiao||"";salvarHistorico(diags,ultimaFotoBase64,regiao);mostrarResultadoStreaming(diags,ultimaFotoBase64,isVideo);}

function mostrarResultadoSolo(data){var div=document.getElementById("resultado");div.style.display="block";var acao=data.acao||"Consulte um agrônomo para mais detalhes.";var textoVoz="Análise de solo. "+acao;var thumbHtml=ultimaFotoBase64?'<img class="card-foto-thumb" src="data:image/jpeg;base64,'+ultimaFotoBase64+'" alt="laudo">':"<div class='card-foto-thumb-placeholder'>🧪</div>";var html='<div class="card-resultado"><div class="card-topo">'+thumbHtml+'<div class="card-titulo"><h2>Análise de Solo</h2><div class="categoria">Recomendação para Café</div></div></div>';html+='<div class="badges"><span class="badge badge-solo">🌱 Laudo Interpretado</span>';if(dadosGPS.regiao)html+='<span class="badge badge-regiao">📍 '+dadosGPS.regiao+'</span>';html+='</div>';if(data.valores){html+='<div class="solo-grid">';for(var k in data.valores){var v=data.valores[k],sc=v.status==="ok"?"solo-ok":v.status==="baixo"?"solo-baixo":"solo-alto",st=v.status==="ok"?"✓ Adequado":v.status==="baixo"?"↓ Baixo":"↑ Alto";html+='<div class="solo-item"><div class="solo-label">'+k+'</div><div class="solo-valor">'+v.valor+'</div><div class="solo-status '+sc+'">'+st+'</div></div>';}html+='</div>';}html+='<div class="divisor"></div><div class="acao-box"><h3>Recomendação</h3><p>'+acao+'</p></div>';html+='<div class="disclaimer-legal">💡 <strong>Use para agir cedo:</strong> identifique a necessidade agora e chegue mais preparado numa visita do Engenheiro Agrônomo — pra ajustes de maior escala, uma análise de solo laboratorial completa dá mais precisão na dose exata.</div>';html+='<div class="btns-resultado"><button class="btn-voz" onclick="falar(\''+textoVoz.replace(/'/g,"\\'")+'\')">🔊 Ouvir</button><button class="btn-nova" onclick="resetar()">📷 Nova análise</button></div></div>';div.innerHTML=html;falar(textoVoz);div.scrollIntoView({behavior:"smooth",block:"start"});}

function mostrarResultadoDaninha(data){
  var div=document.getElementById("resultado");div.style.display="block";
  // Suporte ao novo formato com array de plantas
  var plantas=data.plantas||(data.nome?[data]:[]);
  if(plantas.length===0){mostrarErro();return;}
  var thumbHtml=ultimaFotoBase64?'<img class="card-foto-thumb" src="data:image/jpeg;base64,'+ultimaFotoBase64+'" alt="planta">':"<div class='card-foto-thumb-placeholder'>🌾</div>";
  var qtd=plantas.length>1?plantas.length+" plantas identificadas":"1 planta identificada";
  var html='<div class="card-resultado"><div class="card-topo">'+thumbHtml+'<div class="card-titulo"><h2>'+qtd+'</h2><div class="categoria">Plantas Daninhas Indicadoras</div></div></div>';
  html+='<div class="badges"><span class="badge badge-daninha">🌾 Leitura do Solo</span>';
  if(dadosGPS.regiao)html+='<span class="badge badge-regiao">📍 '+dadosGPS.regiao+'</span>';
  html+='</div>';
  // Indicador geral se houver múltiplas plantas
  if(plantas.length>1&&data.indicador_geral){
    html+='<div class="daninha-alerta daninha-alerta-compactado" style="background:#fff8e1;border-left:4px solid #f57f17"><div class="daninha-alerta-titulo">🔍 O que esse conjunto indica</div><div class="daninha-alerta-desc">'+data.indicador_geral+'</div></div>';
  }
  // Cada planta
  plantas.forEach(function(p,idx){
    var indicador=p.indicador||"";
    var acao=p.acao||"";
    var alertaClass="daninha-alerta-compactado";
    if(indicador.indexOf("cido")>-1||indicador.indexOf("ACIDO")>-1)alertaClass="daninha-alerta-acido";
    else if(indicador.indexOf("rtil")>-1||indicador.indexOf("fertil")>-1)alertaClass="daninha-alerta-fertil";
    else if(indicador.indexOf("umidade")>-1||indicador.indexOf("encharcado")>-1)alertaClass="daninha-alerta-umidade";
    else if(indicador.indexOf("degradado")>-1)alertaClass="daninha-alerta-degradado";
    else if(indicador.indexOf("glifosato")>-1||indicador.indexOf("resistente")>-1)alertaClass="daninha-alerta-compactado";
    var urgBadge=p.urgencia==="alta"?'<span style="background:#fce4ec;color:#c62828;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px">⚠️ URGENTE</span>':p.urgencia==="media"?'<span style="background:#fff3e0;color:#e65100;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px">Atenção</span>':"";
    var conf=(p.confianca||"media").toLowerCase();
    var incerto = conf==="baixa" || /não identificad|nao identificad/i.test(p.nome||"");
    var confBadge = conf==="alta"?'<span style="background:#e8f5e9;color:#2e7d32;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px">✓ Alta confiança</span>':conf==="media"?'<span style="background:#fff8e1;color:#f57f17;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px">~ Confiança média</span>':'<span style="background:#fce4ec;color:#c62828;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px">! Baixa confiança</span>';
    if(plantas.length>1)html+='<div style="padding:8px 20px 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#888">'+(idx+1)+'ª planta encontrada</div>';
    html+='<div class="card-topo" style="padding:10px 20px 6px"><div style="flex:1"><h2 style="font-family:Playfair Display,serif;font-size:18px;color:#3d2b1a">'+p.nome+urgBadge+'</h2><div style="font-size:11px;color:#888;font-style:italic">'+( p.nome_cientifico||"")+'</div><div style="margin-top:5px">'+confBadge+'</div></div></div>';
    if(p.visto)html+='<div style="margin:0 20px 8px;font-size:12px;color:#666;font-style:italic;line-height:1.4">👁️ '+p.visto+'</div>';
    if(incerto){
      html+='<div style="margin:0 20px 12px;background:#fff8e1;border-radius:12px;padding:12px 14px;border-left:4px solid #f5b800"><div style="font-size:13px;font-weight:700;color:#7a5c00;margin-bottom:3px">🔎 Não tenho certeza desta planta</div><div style="font-size:12px;color:#7a5c00;line-height:1.5">'+(acao||'Tire uma foto mais próxima e nítida da planta inteira (folha, caule e base) e tente de novo.')+' Antes de aplicar qualquer produto, confirme a espécie com um técnico — herbicida errado desperdiça dinheiro e pode não controlar o mato.</div></div>';
    } else {
      html+='<div class="daninha-alerta '+alertaClass+'" style="margin:0 20px 10px"><div class="daninha-alerta-titulo">🔍 '+indicador+'</div><div class="daninha-alerta-desc">'+acao+'</div></div>';
      if(p.alerta)html+='<div style="margin:0 20px 10px;background:#fff3e0;border-radius:10px;padding:8px 12px;font-size:12px;color:#e65100;font-weight:600">⚠️ '+p.alerta+'</div>';
      if(p.produtos&&p.produtos.length>0){
        html+='<div class="calc-box" style="margin:0 20px 14px"><div class="calc-titulo">🌿 Controle Recomendado</div>';
        p.produtos.forEach(function(prod){
          html+='<div class="calc-produto"><div class="calc-produto-nome">'+prod.nome+'</div><div style="font-size:12px;color:#555;margin-top:4px">'+prod.dose+(prod.como_usar?' · '+prod.como_usar:'')+'</div></div>';
        });
        html+='</div>';
      }
    }
  });
  // Manejo integrado se múltiplas plantas
  if(plantas.length>1&&data.manejo_integrado){
    html+='<div style="margin:0 20px 14px;background:#e8f5e9;border-radius:12px;padding:12px 14px;border-left:4px solid #2d8a3e"><div style="font-size:13px;font-weight:700;color:#1a5c2a;margin-bottom:4px">🎯 Estratégia para controlar tudo junto</div><div style="font-size:12px;color:#333;line-height:1.5">'+data.manejo_integrado+'</div></div>';
  }
  var textoVoz=plantas.map(function(p){return p.nome+". "+p.indicador+". "+p.acao;}).join(" Além disso, ");
  _textoParaFalar=textoVoz;
  html+='<div class="disclaimer-legal">💡 <strong>Use para agir rápido:</strong> identifique a planta agora e chegue mais preparado numa visita do Engenheiro Agrônomo — a aplicação de herbicidas exige Receituário Agronômico (MAPA/CREA) por lei.</div>';
  html+='<div class="btns-resultado"><button class="btn-voz" onclick="falarTextoAtual()">🔊 Ouvir</button><button class="btn-nova" onclick="resetar()">📷 Nova análise</button></div></div>';
  div.innerHTML=html;
  falar(textoVoz);
  div.scrollIntoView({behavior:"smooth",block:"start"});
}

function mostrarErro(){var div=document.getElementById("resultado");div.style.display="block";div.innerHTML='<div class="card-resultado"><div class="acao-box"><p>⚠️ Não conseguimos concluir a análise após duas tentativas. Isso pode acontecer quando o servidor está iniciando — geralmente funciona ao tentar de novo em alguns segundos.</p></div><div class="btns-resultado"><button class="btn-nova" onclick="resetar()">📷 Tentar novamente</button></div></div>';}

// ── PLANO DE AÇÃO ──
function buildResumo(diags){if(!diags||diags.length===0)return "";var doencas=diags.filter(function(d){return d.diagnostico!=="saudavel"&&CATEGORIAS[d.diagnostico]!=="Deficiência Nutricional"&&CATEGORIAS[d.diagnostico]!=="Deficiencia Nutricional";});var nutricao=diags.filter(function(d){return CATEGORIAS[d.diagnostico]==="Deficiência Nutricional"||CATEGORIAS[d.diagnostico]==="Deficiencia Nutricional";});var saudavel=diags.length===1&&diags[0].diagnostico==="saudavel";var html='<div class="resumo-diag-card"><div class="resumo-diag-titulo">🔬 Diagnóstico do seu cafeeiro</div>';if(saudavel){html+='<div class="resumo-diag-linha">✅ Nenhum problema detectado — planta saudável!</div>';}else{if(doencas.length>0){html+='<div class="resumo-diag-secao">🦠 '+doencas.length+' doença(s) detectada(s):</div>';doencas.forEach(function(d){var cor=d.estagio>=4?"#e53935":d.estagio>=3?"#ef6c00":"#f9a825";html+='<div class="resumo-diag-linha"><span style="color:'+cor+'">'+(EMOJIS[d.diagnostico]||"🌿")+'</span> <strong>'+d.diagnostico.replace(/_/g," ")+'</strong> <span style="color:#aaa;font-size:12px">— Estágio '+d.estagio+'/5</span>'+(d.parcial?' <span style="font-size:11px;color:#bbb">⏳</span>':'')+'</div>';});}if(nutricao.length>0){html+='<div class="resumo-diag-secao" style="margin-top:8px">⚗️ '+nutricao.length+' deficiência(s) nutricional(is):</div>';nutricao.forEach(function(d){html+='<div class="resumo-diag-linha">'+(EMOJIS[d.diagnostico]||"🔥")+' <strong>'+d.diagnostico.replace(/_/g," ")+'</strong>'+(d.parcial?' <span style="font-size:11px;color:#bbb">⏳</span>':'')+'</div>';});}}html+='</div>';return html;}
function buildPlanoAcao(plano){if(!plano)return "";var html='<div class="plano-acao-card"><div class="plano-acao-header"><div class="plano-acao-titulo">📋 O que sua planta precisa</div>';if(plano.resumo_geral)html+='<div class="plano-acao-resumo">'+plano.resumo_geral+'</div>';html+='</div>';if(plano.urgente)html+='<div class="plano-acao-item plano-acao-urgente"><strong>🔴 Esta semana:</strong> '+plano.urgente+'</div>';if(plano.em_21_dias)html+='<div class="plano-acao-item plano-acao-21dias"><strong>🟡 Em 21 dias:</strong> '+plano.em_21_dias+'</div>';if(plano.nutricao)html+='<div class="plano-acao-item plano-acao-nutricao"><strong>🟢 Nutrição:</strong> '+plano.nutricao+'</div>';html+='</div>';return html;}

// ── VOZ ──
function falarTextoAtual(){falar(_textoParaFalar);}
function falar(texto){if(!window.speechSynthesis)return;window.speechSynthesis.cancel();function executarFala(vozes){var msg=new SpeechSynthesisUtterance(texto);msg.lang="pt-BR";msg.rate=0.85;msg.pitch=1.0;var melhor=vozes.find(function(v){return v.name.indexOf("Google")>-1&&v.lang==="pt-BR";});if(!melhor)melhor=vozes.find(function(v){return v.name.indexOf("Francisca")>-1;});if(!melhor)melhor=vozes.find(function(v){return v.name.indexOf("Luciana")>-1;});if(!melhor)melhor=vozes.find(function(v){return v.lang==="pt-BR"&&v.localService;});if(!melhor)melhor=vozes.find(function(v){return v.lang==="pt-BR";});if(!melhor)melhor=vozes.find(function(v){return v.lang.startsWith("pt");});if(melhor)msg.voice=melhor;window.speechSynthesis.speak(msg);}var vozes=window.speechSynthesis.getVoices();if(vozes.length>0){executarFala(vozes);}else{window.speechSynthesis.onvoiceschanged=function(){executarFala(window.speechSynthesis.getVoices());window.speechSynthesis.onvoiceschanged=null;};}}

// ── UTILITÁRIOS ──
function resetar(){ultimaFotoBase64=null;_textoParaFalar="";_ultimosDiags=[];_ultimoPlano=null;document.getElementById("resultado").style.display="none";window.scrollTo(0,0);}
function trocarTalhaoAposAnalise(){
  talhaoAtual=null;
  localStorage.removeItem("dc_analise_talhao_id");
  selecionarTalhao(function(){
    var t=talhaoAtual;
    if(t) alert("✅ Próxima análise será salva em: "+t.nome);
  });
}
function enviarEmail(){window.open("mailto:doutorcafe.app@gmail.com?subject="+encodeURIComponent("Contato via app Doutor Café")+"&body="+encodeURIComponent("Olá equipe Doutor Café,\n\nEscrevo para...\n\nRegião: "+(dadosGPS.regiao||"não informada")));}
function abrirWhatsapp(){window.open("https://wa.me/5535998823395?text="+encodeURIComponent("Olá! Estou usando o app Doutor Café e gostaria de falar com o Gerente Comercial."),"_blank");}

// ── INPUTS DE ARQUIVO ──
function criarInput(id,accept,capture){var old=document.getElementById(id),novo=document.createElement("input");novo.type="file";novo.id=id;novo.accept=accept;if(capture)novo.setAttribute("capture",capture);novo.style.display="none";old.parentNode.replaceChild(novo,old);return novo;}
function bindCam(){var inp=criarInput("cam","image/*","environment");inp.addEventListener("change",function(e){if(e.target.files[0])processar(e.target.files[0],false);bindCam();});}
function bindGal(){var inp=criarInput("gal","image/*,video/*",null);inp.addEventListener("change",function(e){if(!e.target.files[0]){bindGal();return;}var file=e.target.files[0];if(file.type.startsWith("video/"))processarVideo(file);else processar(file,false);bindGal();});}
function bindVid(){var inp=criarInput("vid","video/*","environment");inp.addEventListener("change",function(e){if(e.target.files[0])processarVideo(e.target.files[0]);bindVid();});}
function bindSolo(){var inp=criarInput("solo","image/*","environment");inp.addEventListener("change",function(e){if(e.target.files[0])processarSolo(e.target.files[0]);bindSolo();});}
function bindSoloGal(){var inp=criarInput("soloGal","image/*",null);inp.addEventListener("change",function(e){if(e.target.files[0])processarSolo(e.target.files[0]);bindSoloGal();});}
function bindDaninha(){var inp=criarInput("daninha","image/*","environment");inp.addEventListener("change",function(e){if(e.target.files[0])processarDaninha(e.target.files[0]);bindDaninha();});}
function bindDaninhaGal(){var inp=criarInput("daninaGal","image/*",null);inp.addEventListener("change",function(e){if(e.target.files[0])processarDaninha(e.target.files[0]);bindDaninhaGal();});}

document.getElementById("btnCam").addEventListener("click",function(){selecionarTalhao(function(){document.getElementById("cam").click();});});
document.getElementById("btnGal").addEventListener("click",function(){selecionarTalhao(function(){document.getElementById("gal").click();});});
document.getElementById("btnVid").addEventListener("click",function(){selecionarTalhao(function(){document.getElementById("vid").click();});});
document.getElementById("btnSolo").addEventListener("click",function(){document.getElementById("solo").click();});
document.getElementById("btnSoloGal").addEventListener("click",function(){document.getElementById("soloGal").click();});
document.getElementById("btnDaninha").addEventListener("click",function(){document.getElementById("daninha").click();});
document.getElementById("btnDaninhaGal").addEventListener("click",function(){document.getElementById("daninaGal").click();});

bindCam();bindGal();bindVid();bindSolo();bindSoloGal();bindDaninha();bindDaninhaGal();
window.addEventListener("online",function(){renderAreaHistorico();});
window.addEventListener("offline",function(){renderAreaHistorico();});

// ── NAVEGAÇÃO DE TELAS ──
var CADASTRO_INICIAL_KEY = 'doutorcafe_cadastro_v2';
function mostrarTela(id){['tela-landing','tela-cadastro-inicial','tela-principal'].forEach(function(t){var el=document.getElementById(t);if(el)el.style.display=(t===id)?'block':'none';});window.scrollTo(0,0);}
function irParaCadastroInicial(){mostrarTela('tela-cadastro-inicial');}
function voltarParaLanding(){mostrarTela('tela-landing');}

function submeterCadastroInicial(){
  var nome=(document.getElementById('cadIniNome')||{value:''}).value.trim();
  var cpfRaw=(document.getElementById('cadIniCpf')||{value:''}).value.replace(/[^0-9]/g,'');
  var celRaw=(document.getElementById('cadIniCelular')||{value:''}).value.replace(/[^0-9]/g,'');
  var email=(document.getElementById('cadIniEmail')||{value:''}).value.trim();
  var pin=(document.getElementById('cadIniPin')||{value:''}).value.replace(/[^0-9]/g,'');
  if(!nome){alert('Informe seu nome completo.');return;}
  if(cpfRaw.length!==11){alert('CPF inválido. Digite os 11 dígitos.');return;}
  if(celRaw.length<10){alert('Celular inválido.');return;}
  if(pin.length!==4){alert('Crie um PIN de 4 dígitos.');return;}
  localStorage.setItem(CADASTRO_INICIAL_KEY,JSON.stringify({nome:nome,cpf:cpfRaw,celular:celRaw,email:email,pin:pin,userId:obterUserId(),data:new Date().toISOString()}));
  localStorage.setItem(ANALISES_KEY,'0');
  fetch('https://doutor-cafe-production.up.railway.app/cadastrar-usuario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:obterUserId(),nome:nome,cpf:cpfRaw,celular:celRaw,email:email,pin:pin})}).catch(function(){});
  entrarNoApp(nome);
}

function sincronizarIdentidade(callback){
  var cad = verificarCadastroInicial();
  if (!cad || (!cad.celular && !cad.cpf)) { if(callback) callback(); return; }
  fetch('https://doutor-cafe-production.up.railway.app/cadastrar-usuario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:obterUserId(),nome:cad.nome||'',cpf:cad.cpf||'',celular:cad.celular||'',email:cad.email||'',pin:cad.pin||''})})
  .then(function(r){return r.json();})
  .then(function(d){
    if (d && d.userId && d.userId !== obterUserId()) {
      // O servidor achou uma conta ja existente com esse celular/CPF, diferente
      // do id local deste navegador/PWA — reconecta para nao fragmentar o limite.
      localStorage.setItem('doutorcafe_uid', d.userId);
      cad.userId = d.userId;
      localStorage.setItem(CADASTRO_INICIAL_KEY, JSON.stringify(cad));
      usuarioAtual = cad;
    }
    if (callback) callback();
  })
  .catch(function(){ if (callback) callback(); });
}
function _navSetAtivo(id){
  ["navInicio","navHistorico","navPlanos","navMais"].forEach(function(n){
    var el=document.getElementById(n); if(el)el.classList.remove("ativo");
  });
  var a=document.getElementById(id); if(a)a.classList.add("ativo");
}
function navegarInicio(){_navSetAtivo("navInicio");window.scrollTo({top:0,behavior:"smooth"});}
function navegarHistorico(){
  _navSetAtivo("navHistorico");
  var el=document.getElementById("tituloSecaoHistorico")||document.getElementById("areaHistorico");
  if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
}
function navegarPlanos(){_navSetAtivo("navPlanos");abrirModal(false);setTimeout(function(){_navSetAtivo("navInicio");},400);}
function navegarMais(){
  _navSetAtivo("navMais");
  var el=document.getElementById("cardClima");
  if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
}
function entrarNoApp(nome){usuarioAtual=verificarCadastroInicial();mostrarTela('tela-principal');var nav=document.getElementById('navInferior');if(nav)nav.style.display='flex';sincronizarIdentidade(function(){atualizarContador();sincronizarContadorServidor();});renderAreaHistorico();renderCalendario();obterGPS();obterPrecoCafe();checarLembretesPendentes();if(nome){var primeiroNome=nome.split(' ')[0];setTimeout(function(){var tag=document.getElementById('regiaoTag');if(tag)tag.innerHTML='Olá, '+primeiroNome+'! Vamos diagnosticar';setTimeout(function(){obterGPS();},3000);},600);}}
function verificarCadastroInicial(){try{return JSON.parse(localStorage.getItem(CADASTRO_INICIAL_KEY));}catch(e){return null;}}

// ── TALHÕES ──
var TALHOES_KEY = "dc_talhoes_v1";
var talhaoAtual = null;
var usuarioAtual = null;
var acaoAposTalhao = null;

function getTalhoes(){try{return JSON.parse(localStorage.getItem(TALHOES_KEY)||"[]");}catch(e){return[];}}
function saveTalhoes(talhoes){localStorage.setItem(TALHOES_KEY,JSON.stringify(talhoes));}
function limparTodosTalhoes(){
  if(!confirm("Apagar TODOS os talhões e suas análises?\nEssa ação não pode ser desfeita.")) return;
  localStorage.removeItem(TALHOES_KEY);
  localStorage.removeItem("dc_analise_talhao_id");
  talhaoAtual=null;
  renderTalhoes();
}

function selecionarTalhao(acaoFn){
  acaoAposTalhao=acaoFn;
  var talhoes=getTalhoes();
  var lista=document.getElementById("listaTalhoesModal");
  lista.innerHTML="";
  if(talhoes.length===0){lista.innerHTML='<div style="text-align:center;color:#aaa;padding:20px 0;font-size:14px">Nenhum talhão cadastrado ainda.<br>Crie o primeiro abaixo!</div>';}
  else{talhoes.forEach(function(t){var ultAnalise=t.analises&&t.analises.length>0?t.analises[0]:null;var statusPendente=ultAnalise&&ultAnalise.statusAcao==="pendente";var detalhe=[t.variedade,t.idade?t.idade+"a":"",t.area?t.area+"ha":""].filter(Boolean).join(" · ");var div=document.createElement("div");div.className="talhao-opcao";div.innerHTML='<div class="talhao-opcao-icone">🌿</div><div style="flex:1"><div class="talhao-opcao-nome">'+t.nome+'</div><div class="talhao-opcao-detalhe">'+(detalhe||"Sem detalhes")+'</div></div>'+(statusPendente?'<span style="font-size:11px;color:#e65100;font-weight:700">⚠️ Pendente</span>':'<span style="font-size:11px;color:#2e7d32">✓</span>');div.onclick=function(){confirmarTalhao(t);};lista.appendChild(div);});}
  document.getElementById("modalTalhaoOverlay").classList.add("ativo");
}

function continuarSemTalhao(){talhaoAtual=null;localStorage.removeItem("dc_analise_talhao_id");document.getElementById("modalTalhaoOverlay").classList.remove("ativo");if(acaoAposTalhao){acaoAposTalhao();acaoAposTalhao=null;}}

function confirmarTalhao(talhao){
  talhaoAtual=talhao;
  localStorage.setItem("dc_analise_talhao_id",talhao.id);
  document.getElementById("modalTalhaoOverlay").classList.remove("ativo");
  if(acaoAposTalhao){acaoAposTalhao();acaoAposTalhao=null;}
}

function fecharModalTalhao(){document.getElementById("modalTalhaoOverlay").classList.remove("ativo");acaoAposTalhao=null;}

function abrirCriarTalhao(){document.getElementById("modalTalhaoOverlay").classList.remove("ativo");document.getElementById("ctNome").value="";document.getElementById("ctVariedade").value="";document.getElementById("ctIdade").value="";document.getElementById("ctArea").value="";document.getElementById("modalCriarTalhao").classList.add("ativo");}
function abrirCriarTalhaoSemFoto(){acaoAposTalhao=null;document.getElementById("ctNome").value="";document.getElementById("ctVariedade").value="";document.getElementById("ctIdade").value="";document.getElementById("ctArea").value="";document.getElementById("modalCriarTalhao").classList.add("ativo");}
function fecharCriarTalhao(){document.getElementById("modalCriarTalhao").classList.remove("ativo");if(acaoAposTalhao){document.getElementById("modalTalhaoOverlay").classList.add("ativo");}}

function salvarNovoTalhao(){var nome=document.getElementById("ctNome").value.trim();if(!nome){alert("Informe o nome do talhão.");return;}var novo={id:"t_"+Date.now(),nome:nome,variedade:document.getElementById("ctVariedade").value,idade:parseInt(document.getElementById("ctIdade").value)||null,area:parseFloat(document.getElementById("ctArea").value)||null,criadoEm:new Date().toISOString(),analises:[]};var talhoes=getTalhoes();talhoes.push(novo);saveTalhoes(talhoes);
  // Sync com servidor em background
  var cad=verificarCadastroInicial();
  if(cad&&cad.userId){
    fetch('https://doutor-cafe-production.up.railway.app/salvar-talhao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:cad.userId,talhao:novo})}).catch(function(){});
  }
  document.getElementById("modalCriarTalhao").classList.remove("ativo");renderTalhoes();if(acaoAposTalhao){confirmarTalhao(novo);}else{alert('Talhão '+nome+' criado!');}}

function renderTalhoes(){var lista=document.getElementById("talhoesList");if(!lista)return;var talhoes=getTalhoes();if(talhoes.length===0){lista.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#aaa;font-size:13px;padding:16px 0">Nenhum talhão cadastrado ainda.</div>';return;}lista.innerHTML=talhoes.map(function(t){var analises=t.analises||[];var ult=analises[0];var pendentes=analises.filter(function(a){return a.statusAcao==="pendente";}).length;var ultimaData=ult?new Date(ult.data).toLocaleDateString("pt-BR"):"Sem análises";var ultDiags=ult&&ult.diagnosticos?ult.diagnosticos.slice(0,2).map(function(d){return d.diagnostico;}).join(", "):"";var detalhe=[t.variedade,t.area?t.area+"ha":""].filter(Boolean).join(" · ");return'<div class="talhao-card'+(pendentes>0?" alerta":"")+'" onclick="abrirHistTalhao(\''+t.id+'\')">'+'<div class="talhao-nome">🌿 '+t.nome+'</div>'+'<div class="talhao-var">'+(detalhe||"Talhão")+'</div>'+'<div class="talhao-ultima">📅 '+ultimaData+'</div>'+(ultDiags?'<div style="font-size:11px;color:#888;margin-top:2px">'+ultDiags+'</div>':'')+'<span class="talhao-status '+(pendentes>0?"pendente":"ok")+'">'+(pendentes>0?"⚠️ "+pendentes+" pendente(s)":"✓ Em dia")+'</span></div>';}).join("");}

function abrirHistTalhao(talhaoId){var talhoes=getTalhoes();var t=talhoes.find(function(x){return x.id===talhaoId;});if(!t)return;document.getElementById("histTalhaoNome").textContent="🌿 "+t.nome;var info=[t.variedade,t.idade?t.idade+" anos":"",t.area?t.area+" ha":""].filter(Boolean).join(" · ");document.getElementById("histTalhaoInfo").textContent=info||"Talhão cadastrado";var lista=document.getElementById("histTalhaoLista");var analises=t.analises||[];if(analises.length===0){lista.innerHTML='<div style="text-align:center;padding:40px 20px;color:#aaa">Nenhuma análise registrada neste talhão ainda.</div>';}else{lista.innerHTML=analises.map(function(a,ai){var data=new Date(a.data).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});var diags=a.diagnosticos||[];var fotoHtml=a.fotoFull?'<img class="hist-analise-foto" src="data:image/jpeg;base64,'+a.fotoFull+'">':"<div class='hist-analise-foto' style='background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:22px'>🌿</div>";var resumo=diags.length>0?diags.map(function(d){return(EMOJIS[d.diagnostico]||"🌿")+" "+d.diagnostico.replace(/_/g," ");}).join(", "):"Planta saudável";// Blocos detalhados por doença
var diagsHtml="";diags.forEach(function(d){var estagio=d.estagio||1;var cor=estagio>=4?"#e53935":estagio>=3?"#ef6c00":estagio>=2?"#ffa726":"#66bb6a";var barras="";for(var i=1;i<=5;i++)barras+='<div class="hist-analise-doenca-seg" style="background:'+(i<=estagio?cor:"#e8e8e8")+'"></div>';var acao=d.acao?'<div class="hist-analise-doenca-acao">'+d.acao+'</div>':"";// Produtos com nome comercial + dose por tanque 20L
var produtosHtml="";if(d.fungicidas&&d.fungicidas.length>0){produtosHtml='<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">';d.fungicidas.forEach(function(f){var nomeProd=f.nome_comercial?f.nome_comercial:f.nome;var dose20L=(f.proporcao_por_litro*20).toFixed(1);var unid=f.unidade_proporcao||"g";var tipoCor=f.tipo==="sistemico"?"#283593":f.tipo==="biologico"?"#2e7d32":f.tipo==="acaricida"?"#c62828":f.tipo==="inseticida"?"#6a1b9a":"#e65100";produtosHtml+='<div style="background:#f8f9fa;border-radius:8px;padding:5px 8px;display:flex;justify-content:space-between;align-items:center;gap:8px">'+'<span style="font-size:12px;font-weight:600;color:#3d2b1a">🧴 '+nomeProd+'</span>'+'<span style="font-size:12px;font-weight:700;color:'+tipoCor+';white-space:nowrap">'+dose20L+' '+unid+'/20L</span>'+'</div>';});produtosHtml+='</div>';}diagsHtml+='<div class="hist-analise-doenca"><div class="hist-analise-doenca-emoji">'+(EMOJIS[d.diagnostico]||"🌿")+'</div><div style="flex:1"><div class="hist-analise-doenca-nome">'+d.diagnostico.replace(/_/g," ")+'<span style="font-size:10px;color:#999;font-weight:400;margin-left:6px">Estágio '+estagio+'/5</span></div><div class="hist-analise-doenca-estagio">'+barras+'</div>'+acao+produtosHtml+'</div></div>';});return'<div class="hist-analise-card"><div class="hist-analise-header">'+fotoHtml+'<div style="flex:1"><div class="hist-analise-data">📅 '+data+'</div><div class="hist-analise-diags">'+resumo+'</div></div></div>'+diagsHtml+'<div class="hist-analise-status"><span style="font-size:12px;color:#555">Tratamento:</span><button class="btn-status-talhao '+(a.statusAcao==="pendente"?"btn-status-pendente":"btn-status-ok")+'" onclick="toggleStatusAnalise(\''+t.id+'\','+ai+')">'+(a.statusAcao==="pendente"?"⚠️ Pendente — marcar como feito":"✅ Concluído")+'</button></div></div>';}).join("");}document.getElementById("modalHistTalhao").classList.add("ativo");}
function fecharHistTalhao(){document.getElementById("modalHistTalhao").classList.remove("ativo");}
function toggleStatusAnalise(talhaoId,analiseIdx){var talhoes=getTalhoes();var t=talhoes.find(function(x){return x.id===talhaoId;});if(!t||!t.analises[analiseIdx])return;t.analises[analiseIdx].statusAcao=t.analises[analiseIdx].statusAcao==="pendente"?"concluido":"pendente";saveTalhoes(talhoes);abrirHistTalhao(talhaoId);renderTalhoes();}

// ── LOGIN POR CELULAR+PIN ──
function abrirLoginCpf(){if(document.getElementById("loginCelularInput"))document.getElementById("loginCelularInput").value="";if(document.getElementById("loginPinInput"))document.getElementById("loginPinInput").value="";document.getElementById("loginCpfErro").textContent="";document.getElementById("modalLoginCpf").classList.add("ativo");}
function fecharLoginCpf(){document.getElementById("modalLoginCpf").classList.remove("ativo");}
function confirmarLoginPin(){
  var pin=(document.getElementById("loginPinInput").value||"").replace(/[^0-9]/g,"");
  var erroEl=document.getElementById("loginCpfErro");
  if(pin.length!==4){erroEl.textContent="PIN deve ter 4 dígitos.";return;}
  erroEl.textContent="🔄 Verificando...";
  fetch("https://doutor-cafe-production.up.railway.app/entrar-pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin:pin})})
  .then(function(r){return r.json();})
  .then(function(d){if(!d.ok){erroEl.textContent=d.erro||"Conta não encontrada.";return;}var cadastro={userId:d.userId,nome:d.nome,celular:d.celular,email:d.email,regiao:d.regiao};localStorage.setItem(CADASTRO_INICIAL_KEY,JSON.stringify(cadastro));if(d.plano&&d.plano!=="gratuito"){salvarPlano({tipo:d.plano,planoId:d.planoId});}document.getElementById("modalLoginCpf").classList.remove("ativo");
    // Recuperar talhões do servidor ao logar em novo dispositivo
    fetch('https://doutor-cafe-production.up.railway.app/talhoes/'+d.userId)
    .then(function(r2){return r2.json();})
    .then(function(td){
      if(td.talhoes&&td.talhoes.length>0){
        var talhoesLocais=getTalhoes();
        // Mesclar: adicionar os do servidor que não existem localmente
        td.talhoes.forEach(function(ts){
          if(!talhoesLocais.find(function(tl){return tl.id===ts.id;})){
            talhoesLocais.push(ts);
          }
        });
        saveTalhoes(talhoesLocais);
      }
    }).catch(function(){});
    // CORREÇÃO: buscar analisesUsadas do servidor e gravar no localStorage
    fetch('https://doutor-cafe-production.up.railway.app/analises-restantes/'+d.userId)
    .then(function(r3){return r3.json();})
    .then(function(ad){
      if(ad&&typeof ad.analisesUsadas==='number'){
        localStorage.setItem('doutorcafe_analises', ad.analisesUsadas.toString());
      }
    }).catch(function(){});
    entrarNoApp(d.nome);})
  .catch(function(){erroEl.textContent="Erro de conexão. Verifique sua internet.";});
}

// ── KEEP-ALIVE ──
var servidorAcordado = false;
function acordarServidor(callback){fetch("https://doutor-cafe-production.up.railway.app/ping").then(function(r){return r.json();}).then(function(){servidorAcordado=true;var av=document.getElementById("avisoServidor");if(av)av.style.display="none";if(callback)callback();}).catch(function(){servidorAcordado=false;});}

// ── PIX / USER ID ──
var planoPixAtual='',pixPaymentId=null,pixCheckInterval=null;
function obterUserId(){var u=localStorage.getItem('doutorcafe_uid');if(!u){u='user_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);localStorage.setItem('doutorcafe_uid',u);}return u;}
function abrirPix(tipo){planoPixAtual=tipo;fecharModal();document.getElementById('modalPix').classList.add('ativo');var nomes={basico_mensal:'Básico Mensal - R$ 29,90/mês',basico_anual:'Básico Anual - R$ 299,90/ano',pro_mensal:'Pro Mensal - R$ 39,90/mês',pro_anual:'Pro Anual - R$ 399,90/ano',premium_mensal:'Premium Mensal - R$ 49,90/mês',premium_anual:'Premium Anual - R$ 499,90/ano'};document.getElementById('pixSubtitulo').textContent='Plano '+(nomes[tipo+'_'+cicloAtual]||tipo);document.getElementById('pixArea').innerHTML='<label class="pix-form-label">Nome completo *</label><input class="pix-form-input" id="pixNome" type="text" placeholder="Ex: João da Silva"><label class="pix-form-label">CPF *</label><input class="pix-form-input" id="pixCpf" type="tel" placeholder="000.000.000-00" maxlength="14" oninput="mascararCpf(this)"><label class="pix-form-label">Email (opcional)</label><input class="pix-form-input" id="pixEmail" type="email" placeholder="seuemail@gmail.com"><button onclick="confirmarPix()" style="width:100%;padding:14px;background:linear-gradient(135deg,#2d8a3e,#1a5c2a);color:white;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px">Gerar QR Code PIX</button>';}
function mascararCpf(input){var v=input.value.replace(/[^0-9]/g,'');if(v.length>3)v=v.slice(0,3)+'.'+v.slice(3);if(v.length>7)v=v.slice(0,7)+'.'+v.slice(7);if(v.length>11)v=v.slice(0,11)+'-'+v.slice(11,13);input.value=v;}
function confirmarPix(){var nome=document.getElementById('pixNome').value.trim(),cpf=document.getElementById('pixCpf').value.replace(/[^0-9]/g,''),email=document.getElementById('pixEmail').value.trim()||'produtor@doutorcafe.app';if(!nome){alert('Informe seu nome completo.');return;}if(cpf.length!==11){alert('CPF inválido.');return;}document.getElementById('pixArea').innerHTML='<div class="pix-loading"><div class="pix-spinner"></div> Gerando QR Code...</div>';fetch('https://doutor-cafe-production.up.railway.app/gerar-pix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plano:planoPixAtual+'_'+cicloAtual,userId:obterUserId(),nome:nome,cpf:cpf,email:email})}).then(function(r){return r.json();}).then(function(d){if(d.qr_code_base64){pixPaymentId=d.id;document.getElementById('pixArea').innerHTML='<div class="pix-qr-img"><img src="data:image/png;base64,'+d.qr_code_base64+'" alt="QR PIX"></div><div class="pix-codigo-box"><div class="pix-codigo-label">Código PIX:</div><div class="pix-codigo-txt" id="pixCodigoTxt">'+d.qr_code+'</div></div><div class="pix-status pix-status-aguardando" id="pixStatusTxt">Aguardando pagamento...</div><button class="btn-copiar-pix" onclick="copiarCodigoPix()">Copiar código PIX</button>';iniciarVerificacaoPix();}else{document.getElementById('pixArea').innerHTML='<div class="pix-status pix-status-erro">Erro: '+(d.erro||'Tente novamente.')+'</div>';}}).catch(function(){document.getElementById('pixArea').innerHTML='<div class="pix-status pix-status-erro">Erro de conexão.</div>';});}
function iniciarVerificacaoPix(){if(pixCheckInterval)clearInterval(pixCheckInterval);var t=0;pixCheckInterval=setInterval(function(){t++;if(t>72){clearInterval(pixCheckInterval);return;}if(!pixPaymentId)return;fetch('https://doutor-cafe-production.up.railway.app/verificar-pix/'+pixPaymentId).then(function(r){return r.json();}).then(function(d){if(d.aprovado){clearInterval(pixCheckInterval);var tipo=d.plano_id&&d.plano_id.indexOf('premium')>-1?'premium':d.plano_id&&d.plano_id.indexOf('pro')>-1?'pro':'basico';salvarPlano({tipo:tipo,planoId:d.plano_id,dataAssinatura:new Date().toISOString()});localStorage.setItem(ANALISES_KEY,'0');atualizarContador();document.getElementById('pixArea').innerHTML='<div class="pix-status pix-status-aprovado">✅ Pagamento aprovado! Plano liberado!</div>';setTimeout(function(){fecharPix();},3000);}}).catch(function(){});},5000);}
function copiarCodigoPix(){var txt=document.getElementById('pixCodigoTxt');if(!txt)return;if(navigator.clipboard){navigator.clipboard.writeText(txt.textContent).then(function(){alert('Código PIX copiado!');});}else{var el=document.createElement('textarea');el.value=txt.textContent;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);alert('Código PIX copiado!');}}
function fecharPix(){if(pixCheckInterval)clearInterval(pixCheckInterval);pixPaymentId=null;document.getElementById('modalPix').classList.remove('ativo');}

// ── INICIALIZAÇÃO ──
verificarRetornoPagamento();
acordarServidor(null);
setInterval(function(){acordarServidor(null);},25000);

(function(){
  var cadastro=verificarCadastroInicial();
  if(cadastro&&cadastro.nome){entrarNoApp(cadastro.nome);}
  else{mostrarTela('tela-landing');}
})();
</script>
<script>
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js').then(function(reg){
      console.log('SW registrado:', reg.scope);
    }).catch(function(err){
      console.log('SW erro:', err);
    });
  });
}
</script>
</body>
</html>
