/** "#2f6f3e" -> [47, 111, 62] */
function hexParaRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Topo "redondo" e passo das linhas de grade (até ~5 divisões). */
function escalaEixo(linhas, campos) {
    var maxV = 0;
    linhas.forEach(function (l) {
        campos.forEach(function (c) { maxV = Math.max(maxV, l[c]); });
    });
    if (maxV <= 0) maxV = 1;
    var passo = Math.pow(10, Math.floor(Math.log10(maxV)));
    [1, 2, 2.5, 5, 10].some(function (f) {
        if (maxV / (passo * f) <= 5) { passo *= f; return true; }
        return false;
    });
    return { passo: passo, topo: Math.ceil(maxV / passo) * passo };
}

/**
 * Monta o PDF a partir do modelo do relatório (o mesmo usado na tela):
 * { subtitulo, params: [[rótulo, valor]], cards: [{rotulo, valor, cor}], info: [{texto, alerta}],
 *   series: [{campo, nome, cor}], meses, mensal, anual, colunas: [{titulo, campo}] }
 */
function gerarRelatorioPdf(modelo) {
    'use strict';

    var PRIMARIA = [47, 111, 62], ALERTA = [30, 77, 43], CINZA = [108, 117, 125], ESCURO = [33, 37, 41], BORDA = [222, 226, 230];
    var FUNDO = [247, 248, 250], BRANCO = [255, 255, 255];

    var M = 40;                                  // margem
    var W = PdfSimples.LARGURA - 2 * M;          // largura útil
    var LIMITE = PdfSimples.ALTURA - 50;         // y máximo antes do rodapé

    var pdf = new PdfSimples();
    var agora = new Date();
    var geradoEm = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var y = 0;

    pdf.definirRodape(function (pdf, pg, total) {
        var yr = PdfSimples.ALTURA - 30;
        pdf.linha(M, yr - 10, M + W, yr - 10, BORDA);
        pdf.texto(M, yr, 'Simulação gerada em ' + geradoEm + ' — valores estimados, sem custos ou taxas adicionais.', 7.5, false, CINZA);
        pdf.texto(M + W, yr, 'Página ' + pg + ' de ' + total, 7.5, false, CINZA, 'R');
    });

    function novaPaginaSePreciso(altura) {
        if (y + altura > LIMITE) {
            pdf.novaPagina();
            y = 50;
        }
    }

    function quebrarLinhas(texto, tamanho, largura) {
        var linhas = [], atual = '';
        texto.split(' ').forEach(function (p) {
            var teste = atual ? atual + ' ' + p : p;
            if (atual && pdf.larguraTexto(teste, tamanho) > largura) {
                linhas.push(atual);
                atual = p;
            } else {
                atual = teste;
            }
        });
        if (atual) linhas.push(atual);
        return linhas;
    }

    pdf.novaPagina();

    // Cabeçalho
    pdf.retangulo(0, 0, PdfSimples.LARGURA, 70, PRIMARIA);
    pdf.texto(M, 38, 'Simulador de Juros Compostos', 20, true, BRANCO);
    pdf.texto(M, 56, modelo.subtitulo, 10, false, [214, 234, 206]);
    y = 95;

    // Parâmetros
    pdf.texto(M, y, 'Parâmetros', 12, true, PRIMARIA);
    y += 10;
    var alturaBox = Math.ceil(modelo.params.length / 2) * 20 + 12;
    pdf.retangulo(M, y, W, alturaBox, FUNDO, BORDA);
    modelo.params.forEach(function (item, i) {
        var x = M + 12 + (i % 2) * (W / 2);
        var yy = y + 22 + Math.floor(i / 2) * 20;
        pdf.texto(x, yy, item[0], 8.5, false, CINZA);
        pdf.texto(x + 95, yy, item[1], 9, true, ESCURO);
    });
    y += alturaBox + 25;

    // Resumo
    pdf.texto(M, y, 'Resultado', 12, true, PRIMARIA);
    y += 10;
    var cards = modelo.cards, gap = 8, cw = (W - gap * (cards.length - 1)) / cards.length;
    cards.forEach(function (c, i) {
        var x = M + i * (cw + gap), rgb = hexParaRgb(c.cor);
        pdf.retangulo(x, y, cw, 50, BRANCO, BORDA);
        pdf.retangulo(x, y, 3, 50, rgb);
        pdf.texto(x + 12, y + 19, c.rotulo, 8, false, CINZA);
        pdf.texto(x + 12, y + 37, c.valor, cards.length > 3 ? 11 : 13, true, rgb);
    });
    y += 66;

    modelo.info.forEach(function (a) {
        quebrarLinhas(a.texto, 9, W - 10).forEach(function (linha, k) {
            novaPaginaSePreciso(14);
            pdf.texto(M + (k ? 8 : 0), y, (k ? '' : '• ') + linha, 9, false, a.alerta ? ALERTA : ESCURO);
            y += 13;
        });
        y += 2;
    });
    y += 12;

    // Gráfico de evolução
    novaPaginaSePreciso(240);
    pdf.texto(M, y, 'Evolução do patrimônio', 12, true, PRIMARIA);
    y += 12;
    var gh = 170, gx = M + 60, gw = W - 70;
    var serie = modelo.mensal;
    var escala = escalaEixo(serie, modelo.series.map(function (s) { return s.campo; }));
    for (var v = 0; v <= escala.topo + 1e-6; v += escala.passo) {
        var yy = y + gh - (v / escala.topo) * gh;
        pdf.linha(gx, yy, gx + gw, yy, [233, 236, 239]);
        pdf.texto(gx - 6, yy + 3, 'R$ ' + new Intl.NumberFormat('pt-BR').format(v), 7, false, CINZA, 'R');
    }
    var nPts = serie.length - 1;
    var ptX = function (i) { return gx + (nPts ? i / nPts : 0) * gw; };
    var ptY = function (val) { return y + gh - (val / escala.topo) * gh; };
    modelo.series.forEach(function (s, idx) {
        pdf.polilinha(serie.map(function (l, i) { return [ptX(i), ptY(l[s.campo])]; }), hexParaRgb(s.cor), idx === 0 ? 1.8 : 1.2);
    });
    var passoAno = Math.max(1, Math.ceil(modelo.meses / 12 / 10));
    for (var a = 0; a * 12 <= modelo.meses; a += passoAno) {
        pdf.texto(ptX(a * 12), y + gh + 12, modelo.meses <= 24 ? (a * 12) + 'm' : 'Ano ' + a, 7, false, CINZA, 'C');
    }
    y += gh + 26;
    var lx = gx;
    modelo.series.forEach(function (s) {
        pdf.retangulo(lx, y - 6, 10, 3, hexParaRgb(s.cor));
        pdf.texto(lx + 14, y - 2, s.nome, 8, false, ESCURO);
        lx += 24 + pdf.larguraTexto(s.nome, 8);
    });
    y += 20;

    // Tabelas: 1ª coluna (período) fixa, demais dividem o resto
    var colunas = [{ titulo: 'Período', largura: 0.10 }].concat(modelo.colunas.map(function (c) {
        return { titulo: c.titulo, campo: c.campo, largura: 0.90 / modelo.colunas.length };
    }));

    function cabecalho(yc) {
        pdf.retangulo(M, yc, W, 18, PRIMARIA);
        var x = M;
        colunas.forEach(function (c, i) {
            var w = c.largura * W;
            pdf.texto(i ? x + w - 6 : x + 6, yc + 12.5, c.titulo, 8, true, BRANCO, i ? 'R' : 'L');
            x += w;
        });
        return yc + 18;
    }

    function tabela(titulo, linhas, rotulo) {
        novaPaginaSePreciso(60);
        pdf.texto(M, y, titulo, 12, true, PRIMARIA);
        y = cabecalho(y + 8);
        linhas.forEach(function (l, k) {
            if (y + 15 > LIMITE) {
                pdf.novaPagina();
                y = cabecalho(40);
            }
            if (k % 2) pdf.retangulo(M, y, W, 15, FUNDO);
            var x = M;
            colunas.forEach(function (c, i) {
                var w = c.largura * W;
                if (i) {
                    pdf.texto(x + w - 6, y + 10.5, Calculadora.moeda(l[c.campo]), 7.5, i === colunas.length - 1, ESCURO, 'R');
                } else {
                    pdf.texto(x + 6, y + 10.5, rotulo(l), 7.5, false, ESCURO);
                }
                x += w;
            });
            y += 15;
        });
        pdf.linha(M, y, M + W, y, BORDA);
        y += 30;
    }

    if (modelo.meses > 12) {
        tabela('Evolução anual', modelo.anual, function (l) { return l.mes % 12 === 0 ? 'Ano ' + l.ano : 'Mês ' + l.mes; });
    }
    tabela('Evolução mensal', modelo.mensal.slice(1), function (l) { return 'Mês ' + l.mes; });

    return pdf.blob();
}
