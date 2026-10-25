/**
 * Gerador de PDF mínimo, sem dependências (fontes padrão Helvetica / Helvetica-Bold),
 * e o relatório da simulação montado em cima dele.
 * Coordenadas em pontos, origem no canto SUPERIOR esquerdo (convertido internamente).
 */
var PdfSimples = (function () {
    'use strict';

    var LARGURA = 595.28; // A4
    var ALTURA = 841.89;

    var LARGURAS = {
        normal: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
        negrito: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
    };

    // Caracteres fora do Latin-1 que existem no WinAnsiEncoding
    var WIN_ANSI = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

    function codificar(texto) {
        var s = '';
        for (var i = 0; i < texto.length; i++) {
            var ch = texto.charAt(i), c = texto.charCodeAt(i);
            if (c < 128 || (c >= 160 && c <= 255)) s += ch;
            else if (WIN_ANSI[ch]) s += String.fromCharCode(WIN_ANSI[ch]);
            else s += '?';
        }
        return s;
    }

    function n(v) {
        return String(Math.round(v * 1000) / 1000);
    }

    function cor(rgb) {
        return n(rgb[0] / 255) + ' ' + n(rgb[1] / 255) + ' ' + n(rgb[2] / 255);
    }

    function Pdf() {
        this.paginas = [];
        this.atual = -1;
        this.rodape = null;
    }

    Pdf.LARGURA = LARGURA;
    Pdf.ALTURA = ALTURA;

    Pdf.prototype.definirRodape = function (fn) { this.rodape = fn; };

    Pdf.prototype.novaPagina = function () {
        this.paginas.push('');
        this.atual = this.paginas.length - 1;
    };

    Pdf.prototype.cmd = function (s) { this.paginas[this.atual] += s + '\n'; };

    Pdf.prototype.larguraTexto = function (texto, tamanho, negrito) {
        var s = codificar(texto), tabela = negrito ? LARGURAS.negrito : LARGURAS.normal, w = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c >= 32 && c <= 126) w += tabela[c - 32];
            else if (c >= 0xC0 && c <= 0xDE) w += 722; // maiúsculas acentuadas
            else w += 556;                              // minúsculas acentuadas e demais
        }
        return w * tamanho / 1000;
    };

    /** alinhar: L, C ou R (C/R usam x como centro/borda direita) */
    Pdf.prototype.texto = function (x, y, texto, tamanho, negrito, rgb, alinhar) {
        tamanho = tamanho || 10;
        rgb = rgb || [33, 37, 41];
        if (alinhar === 'R') x -= this.larguraTexto(texto, tamanho, negrito);
        else if (alinhar === 'C') x -= this.larguraTexto(texto, tamanho, negrito) / 2;
        var s = codificar(String(texto)).replace(/[\\()]/g, '\\$&').replace(/[\r\n]/g, ' ');
        this.cmd('BT ' + cor(rgb) + ' rg /' + (negrito ? 'F2' : 'F1') + ' ' + n(tamanho) + ' Tf ' +
            n(x) + ' ' + n(ALTURA - y) + ' Td (' + s + ') Tj ET');
    };

    Pdf.prototype.retangulo = function (x, y, w, h, preenchimento, borda, espessura) {
        var op = '';
        if (preenchimento) {
            this.cmd(cor(preenchimento) + ' rg');
            op = 'f';
        }
        if (borda) {
            this.cmd(cor(borda) + ' RG ' + n(espessura || 0.5) + ' w');
            op = preenchimento ? 'B' : 'S';
        }
        if (op) this.cmd(n(x) + ' ' + n(ALTURA - y - h) + ' ' + n(w) + ' ' + n(h) + ' re ' + op);
    };

    Pdf.prototype.linha = function (x1, y1, x2, y2, rgb, espessura) {
        this.polilinha([[x1, y1], [x2, y2]], rgb || [200, 200, 200], espessura || 0.5);
    };

    Pdf.prototype.polilinha = function (pontos, rgb, espessura) {
        if (pontos.length < 2) return;
        var s = cor(rgb) + ' RG ' + n(espessura || 1) + ' w 1 j 1 J\n';
        pontos.forEach(function (pt, i) {
            s += n(pt[0]) + ' ' + n(ALTURA - pt[1]) + (i ? ' l' : ' m') + '\n';
        });
        this.cmd(s + 'S');
    };

    /** Retorna um Blob application/pdf */
    Pdf.prototype.blob = function () {
        var self = this;
        if (this.rodape) {
            var total = this.paginas.length;
            this.paginas.forEach(function (_, i) {
                self.atual = i;
                self.rodape(self, i + 1, total);
            });
        }

        var objs = [];
        objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

        var kids = [], prox = 5;
        this.paginas.forEach(function (conteudo) {
            var pg = prox++, ct = prox++;
            kids.push(pg + ' 0 R');
            objs[pg] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(LARGURA) + ' ' + n(ALTURA) + ']' +
                ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + ct + ' 0 R >>';
            objs[ct] = '<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream';
        });
        objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';

        // Todo o conteúdo é 1 char = 1 byte (WinAnsi), então length == offset em bytes
        var pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offsets = [];
        for (var i = 1; i < objs.length; i++) {
            offsets[i] = pdf.length;
            pdf += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
        }
        var xref = pdf.length;
        pdf += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
        for (i = 1; i < objs.length; i++) {
            pdf += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
        }
        pdf += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';

        var bytes = new Uint8Array(pdf.length);
        for (i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
        return new Blob([bytes], { type: 'application/pdf' });
    };

    return Pdf;
})();


