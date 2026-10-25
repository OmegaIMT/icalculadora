(function () {
    'use strict';

    var C = Calculadora;
    var $ = function (id) { return document.getElementById(id); };
    var form = $('form');

    var CORES = { primaria: '#2f6f3e', azul: '#3468af', ouro: '#b7791f', laranja: '#d67814', roxo: '#6f42c1' };

    var modo = 'simples';
    var modelo = null; // modelo da última simulação (tela + PDF)

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ---------- Máscaras ---------- */
    function formatarMoeda(digitos) {
        digitos = digitos.replace(/\D/g, '').replace(/^0+/, '');
        if (!digitos) return '';
        while (digitos.length < 3) digitos = '0' + digitos;
        var inteiro = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return inteiro + ',' + digitos.slice(-2);
    }

    document.querySelectorAll('input.moeda').forEach(function (el) {
        el.addEventListener('input', function () {
            el.value = formatarMoeda(el.value);
            el.setSelectionRange(el.value.length, el.value.length);
        });
    });

    document.querySelectorAll('input.decimal').forEach(function (el) {
        el.addEventListener('input', function () {
            var v = el.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
            var i = v.indexOf(',');
            if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, '');
            el.value = v;
        });
    });

    document.querySelectorAll('input.inteiro').forEach(function (el) {
        el.addEventListener('input', function () {
            el.value = el.value.replace(/\D/g, '');
        });
    });

    /* ---------- Simples x Avançada ---------- */
    function esconderResultado() {
        modelo = null;
        $('erros').hidden = true;
        $('resultado').hidden = true;
        $('gerar-pdf').hidden = true;
    }

    function definirModo(novo) {
        modo = novo;
        document.querySelectorAll('.modos button').forEach(function (b) {
            b.classList.toggle('ativa', b.getAttribute('data-modo') === modo);
        });
        // fieldset desabilitado fica fora do FormData
        $('modo-simples').disabled = $('modo-simples').hidden = modo !== 'simples';
        $('modo-avancado').disabled = $('modo-avancado').hidden = modo !== 'avancado';
        $('toggle-retirada').hidden = modo !== 'simples';
        esconderResultado();
    }

    document.querySelectorAll('.modos button').forEach(function (b) {
        b.addEventListener('click', function () { definirModo(b.getAttribute('data-modo')); });
    });

    /* ---------- Campos excludentes (avançada) ---------- */
    var excludentes = document.querySelectorAll('[data-exclui]');

    function atualizarExcludentes() {
        excludentes.forEach(function (el) {
            var preenchido = C.numero(el.value) > 0;
            el.getAttribute('data-exclui').split(' ').forEach(function (id) {
                $(id).disabled = preenchido;
            });
        });
    }

    excludentes.forEach(function (el) {
        el.addEventListener('input', atualizarExcludentes);
    });

    /* ---------- Inflação média (IPCA 10 anos) ---------- */
    // IPCA anual oficial (IBGE), usado se não der para consultar o Banco Central
    var IPCA_ANUAL = { 2015: 10.67, 2016: 6.29, 2017: 2.95, 2018: 3.75, 2019: 4.31, 2020: 4.52, 2021: 10.06, 2022: 5.79, 2023: 4.62, 2024: 4.83 };
    var inflacaoEditada = false;

    function mostrarInflacao(valor, fonte) {
        if (!inflacaoEditada) $('av-inflacao').value = valor.toFixed(2).replace('.', ',');
        $('inflacao-fonte').textContent = fonte;
    }

    (function carregarInflacao() {
        var anos = Object.keys(IPCA_ANUAL);
        var produto = anos.reduce(function (t, a) { return t * (1 + IPCA_ANUAL[a] / 100); }, 1);
        mostrarInflacao((Math.pow(produto, 1 / anos.length) - 1) * 100,
            'IPCA médio ' + anos[0] + '–' + anos[anos.length - 1] + ' (IBGE). Pode alterar.');

        // Tenta a série oficial mais recente: IPCA mensal (SGS 433), últimos 120 meses
        if (!window.fetch) return;
        var ctrl = window.AbortController ? new AbortController() : null;
        if (ctrl) setTimeout(function () { ctrl.abort(); }, 8000);
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/120?formato=json', ctrl ? { signal: ctrl.signal } : {})
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (dados) {
                if (!Array.isArray(dados) || dados.length < 120) return;
                var prod = dados.reduce(function (t, d) { return t * (1 + Number(d.valor) / 100); }, 1);
                if (!isFinite(prod)) return;
                var ultimo = String(dados[dados.length - 1].data || '').slice(3); // dd/mm/aaaa -> mm/aaaa
                mostrarInflacao((Math.pow(prod, 1 / 10) - 1) * 100,
                    'IPCA médio dos últimos 10 anos (Banco Central, até ' + ultimo + '). Pode alterar.');
            })
            .catch(function () { /* sem internet: fica o valor fixo */ });
    })();

    $('av-inflacao').addEventListener('input', function () { inflacaoEditada = true; });

    /* ---------- Alíquota de IR "outra" ---------- */
    function atualizarIrOutra() {
        var outra = $('av-ir_tipo').value === 'outra';
        document.querySelector('.ir-outra').hidden = !outra;
        $('av-ir_tipo').classList.toggle('select-cheio', !outra);
    }
    $('av-ir_tipo').addEventListener('change', function () {
        atualizarIrOutra();
        if ($('av-ir_tipo').value === 'outra') $('av-ir_outra').focus();
    });

    /* ---------- Liga/desliga retiradas (simples) ---------- */
    var retiradaAtiva = false;
    var toggle = $('toggle-retirada');

    function definirRetirada(ligar) {
        retiradaAtiva = ligar;
        form.classList.toggle('retirada-on', ligar);
        $('linha-valores').classList.toggle('com-retirada', ligar);
        toggle.textContent = ligar ? 'Remover retiradas mensais' : 'Simular retiradas mensais';
    }

    var retiradaInput = $('retirada_mensal');
    var retiradaTipo = $('retirada_tipo');
    var retiradaFixo = true;

    function atualizarTipoRetirada() {
        var fixo = retiradaTipo.value === 'fixo';
        $('retirada-prefixo').textContent = fixo ? 'R$' : '%';
        retiradaInput.inputMode = fixo ? 'numeric' : 'decimal';
        retiradaInput.placeholder = '0,00';
        $('retirada-dica').hidden = fixo;
        if (fixo !== retiradaFixo) retiradaInput.value = ''; // só limpa ao trocar R$ <-> %
        retiradaFixo = fixo;
    }
    retiradaTipo.addEventListener('change', function () {
        atualizarTipoRetirada();
        retiradaInput.focus();
    });
    retiradaInput.addEventListener('input', function () {
        if (retiradaTipo.value === 'fixo') {
            retiradaInput.value = formatarMoeda(retiradaInput.value);
        } else {
            var v = retiradaInput.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
            var i = v.indexOf(',');
            if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, '');
            retiradaInput.value = v;
        }
    });

    toggle.addEventListener('click', function () {
        definirRetirada(!retiradaAtiva);
        if (retiradaAtiva) $('retirada_mensal').focus();
    });

    /* ---------- Calcular / limpar / PDF ---------- */
    function lerFormulario() {
        var fd = new FormData(form), dados = {};
        fd.forEach(function (v, k) { dados[k] = v; });
        dados.retirada_ativa = retiradaAtiva;
        return dados;
    }

    function mostrarErros(erros) {
        $('erros').innerHTML = erros.map(esc).join('<br>');
        $('erros').hidden = false;
        $('resultado').hidden = true;
        $('gerar-pdf').hidden = true;
        modelo = null;
    }

    form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var dados = lerFormulario();

        if (modo === 'simples') {
            var e = C.entrada(dados);
            if (e.erros.length) return mostrarErros(e.erros);
            modelo = modeloSimples(e.p, C.calcular(e.p));
        } else {
            var ea = C.entradaAvancada(dados);
            if (ea.erros.length) return mostrarErros(ea.erros);
            var ra = C.calcularAvancada(ea.p);
            if (ra.erro) return mostrarErros([ra.erro]);
            modelo = modeloAvancado(ea.p, ra);
        }

        $('erros').hidden = true;
        renderizar(modelo);
        $('gerar-pdf').hidden = false;
        $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('limpar').addEventListener('click', function () {
        var inflacao = $('av-inflacao').value;
        form.reset();
        if (!inflacaoEditada) $('av-inflacao').value = inflacao; // mantém a média carregada
        definirRetirada(false);
        atualizarTipoRetirada();
        atualizarExcludentes();
        atualizarIrOutra();
        esconderResultado();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('gerar-pdf').addEventListener('click', function () {
        if (!modelo) return;
        var blob = gerarRelatorioPdf(modelo);
        var d = new Date(), z = function (x) { return ('0' + x).slice(-2); };
        var nome = 'simulacao-juros-compostos-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) +
            '-' + z(d.getHours()) + z(d.getMinutes()) + '.pdf';
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    });

    /* ---------- Modelos do relatório (tela + PDF) ---------- */
    function textoTaxa(p) {
        return C.percentual(p.taxa / 100) + (p.taxa_tipo === 'anual' ? ' ao ano' : ' ao mês');
    }

    function modeloSimples(p, r) {
        var params = [
            ['Valor inicial', C.moeda(p.valor_inicial)],
            ['Depósito mensal', C.moeda(p.deposito_mensal)],
            ['Taxa de juros', textoTaxa(p)],
            ['Taxa equivalente', C.percentual(r.taxa_mensal) + ' a.m. / ' + C.percentual(r.taxa_anual) + ' a.a.'],
            ['Período', C.descreverMeses(r.meses) + ' (' + r.meses + ' meses)']
        ];
        if (p.retirada_ativa) {
            params.push(['Retirada mensal', p.retirada_tipo === 'fixo' ? C.moeda(p.retirada_mensal)
                : C.percentual(p.retirada_mensal / 100) + ' do saldo (' + (p.retirada_tipo === 'liquida' ? 'líquida, sem os juros' : 'bruta, valor total') + ')']);
            params.push(['Início das retiradas', 'Mês ' + r.inicio_retirada + (p.parar_depositos ? ' (depósitos encerrados)' : ' (depósitos continuam)')]);
        }

        var cards = [
            { rotulo: 'Valor total final', valor: C.moeda(r.saldo_final), cor: CORES.primaria },
            { rotulo: 'Valor total investido', valor: C.moeda(r.investido), cor: CORES.azul },
            { rotulo: 'Total em juros', valor: C.moeda(r.juros), cor: CORES.ouro }
        ];
        if (p.retirada_ativa) cards.push({ rotulo: 'Total retirado', valor: C.moeda(r.retirado), cor: CORES.laranja });

        var info = [{ texto: 'Taxa equivalente: ' + C.percentual(r.taxa_mensal) + ' a.m. / ' + C.percentual(r.taxa_anual) +
            ' a.a. — período de ' + C.descreverMeses(r.meses) + ' (' + r.meses + ' meses).' }];
        if (p.retirada_ativa && r.saldo_inicio_retiradas !== null) {
            info.push({ texto: 'Saldo acumulado ao iniciar as retiradas (mês ' + r.inicio_retirada + '): ' + C.moeda(r.saldo_inicio_retiradas) + '.' });
        } else if (p.retirada_ativa) {
            info.push({ alerta: true, texto: 'As retiradas começariam no mês ' + r.inicio_retirada + ', depois do fim do período simulado.' });
        }
        if (r.esgotado_mes) {
            info.push({ alerta: true, texto: 'Atenção: o saldo se esgota no mês ' + r.esgotado_mes + ' (' + C.descreverMeses(r.esgotado_mes) + ').' });
        }
        if (r.saldo_final > 0) {
            info.push({ texto: 'Rendimento mensal do saldo final: ' + C.moeda(r.renda_mensal) + ' (retirada que mantém o patrimônio).' });
        }

        var series = [
            { campo: 'saldo', nome: 'Saldo', cor: CORES.primaria },
            { campo: 'investido', nome: 'Total investido', cor: CORES.azul }
        ];
        if (p.retirada_ativa) series.push({ campo: 'retirado', nome: 'Total retirado', cor: CORES.laranja });

        var colunas = [{ titulo: 'Juros', campo: 'juros' }, { titulo: 'Depósitos', campo: 'deposito' }];
        if (p.retirada_ativa) colunas.push({ titulo: 'Retiradas', campo: 'retirada' });
        colunas.push({ titulo: 'Total investido', campo: 'investido' },
            { titulo: 'Total juros', campo: 'juros_acum' }, { titulo: 'Saldo', campo: 'saldo' });

        return {
            subtitulo: 'Simulação simples',
            params: params, cards: cards, info: info, series: series, colunas: colunas,
            meses: r.meses, mensal: r.mensal, anual: r.anual
        };
    }

    function modeloAvancado(p, r) {
        var porRenda = p.renda_hoje > 0;
        var calculaDeposito = p.periodo > 0;
        var textoIr = p.ir > 0 ? 'IR de ' + C.percentual(p.ir, 2) : 'isento de IR';
        var fr = r.fase_renda;

        var params = [
            porRenda
                ? ['Renda desejada hoje', C.moeda(p.renda_hoje) + ' (' + textoIr + ')']
                : ['Valor final desejado', C.moeda(p.valor_final)],
            calculaDeposito
                ? ['Período', C.descreverMeses(r.meses)]
                : ['Valor mensal', C.moeda(p.deposito_mensal)],
            ['Taxa de juros', textoTaxa(p)],
            ['Taxa equivalente', C.percentual(r.taxa_mensal) + ' a.m. / ' + C.percentual(r.taxa_anual) + ' a.a.'],
            ['Inflação média', C.percentual(p.inflacao / 100, 2) + ' ao ano'],
            ['Valor já investido', C.moeda(p.valor_inicial)],
            ['Correção do mensal', p.corrigir_deposito ? 'Pela inflação, todo mês' : 'Sem correção']
        ];

        var cards = [
            calculaDeposito
                ? { rotulo: 'Guardar por mês', valor: C.moeda(r.deposito), cor: CORES.primaria }
                : { rotulo: 'Tempo necessário', valor: C.descreverMeses(r.meses), cor: CORES.primaria },
            { rotulo: 'Patrimônio no final', valor: C.moeda(r.saldo_final), cor: CORES.roxo },
            { rotulo: 'Total investido', valor: C.moeda(r.investido), cor: CORES.azul },
            { rotulo: 'Total em juros', valor: C.moeda(r.juros), cor: CORES.ouro }
        ];

        var anosTxt = C.descreverMeses(r.meses);
        var info = [];
        if (calculaDeposito && r.deposito === 0) {
            info.push({ texto: 'O valor já investido sozinho atinge a meta: não é preciso guardar nada por mês.' });
        } else if (p.corrigir_deposito && p.inflacao > 0) {
            info.push({ texto: 'O valor mensal começa em ' + C.moeda(r.deposito) + ' e é corrigido pela inflação todo mês, chegando a ' +
                C.moeda(r.deposito_final) + ' no último mês (o mesmo poder de compra de hoje).' });
        }
        if (porRenda) {
            info.push({ texto: 'Renda de ' + C.moeda(p.renda_hoje) + ' hoje equivale a ' + C.moeda(r.renda_futura) +
                ' daqui a ' + anosTxt + ', corrigida pela inflação de ' + C.percentual(p.inflacao / 100, 2) + ' ao ano.' });
        }
        info.push({ texto: 'Patrimônio no final: ' + C.moeda(r.saldo_final) + ' — em valores de hoje: ' + C.moeda(r.saldo_final_hoje) + '.' });
        info.push({ texto: 'Depois disso, todo mês o patrimônio rende ' + C.moeda(fr.rendimento) +
            (fr.imposto > 0 ? ', paga ' + C.moeda(fr.imposto) + ' de IR (' + C.percentual(p.ir, 2) + ')' : (porRenda ? ' sem IR (isento)' : '')) +
            '; você retira ' + C.moeda(fr.renda) + ' (' + C.moeda(fr.renda_hoje) + ' em valores de hoje) e reinveste ' +
            C.moeda(fr.reinvestir) + ' para acompanhar a inflação. Corrigindo os dois pela inflação a cada mês, o poder de compra se mantém para sempre.' });
        if (p.inflacao <= 0) {
            info.push({ alerta: true, texto: 'Sem inflação informada: nenhum valor está sendo corrigido.' });
        }

        return {
            subtitulo: 'Simulação avançada — planejamento de meta',
            params: params, cards: cards, info: info,
            series: [
                { campo: 'saldo', nome: 'Saldo', cor: CORES.primaria },
                { campo: 'investido', nome: 'Total investido', cor: CORES.azul },
                { campo: 'saldo_hoje', nome: 'Saldo em valores de hoje', cor: CORES.roxo }
            ],
            colunas: [
                { titulo: 'Juros', campo: 'juros' },
                { titulo: 'Depósitos', campo: 'deposito' },
                { titulo: 'Total investido', campo: 'investido' },
                { titulo: 'Total juros', campo: 'juros_acum' },
                { titulo: 'Saldo (hoje)', campo: 'saldo_hoje' },
                { titulo: 'Saldo', campo: 'saldo' }
            ],
            meses: r.meses, mensal: r.mensal, anual: r.anual
        };
    }

    /* ---------- Renderização do resultado ---------- */
    var abaAtual = 'anual';

    function renderizar(m) {
        $('cards').className = 'cards' + (m.cards.length > 3 ? ' quatro' : '');
        $('cards').innerHTML = m.cards.map(function (c, i) {
            return i === 0
                ? '<div class="resumo destaque"><span>' + esc(c.rotulo) + '</span><strong>' + esc(c.valor) + '</strong></div>'
                : '<div class="resumo" style="border-left-color:' + c.cor + '"><span>' + esc(c.rotulo) +
                  '</span><strong style="color:' + c.cor + '">' + esc(c.valor) + '</strong></div>';
        }).join('');

        $('info').innerHTML = m.info.map(function (a) {
            return '<li' + (a.alerta ? ' class="aviso"' : '') + '>' + esc(a.texto) + '</li>';
        }).join('');

        $('abas').hidden = m.meses <= 12;
        abaAtual = m.meses > 12 ? 'anual' : 'mensal';
        marcarAba();
        renderizarTabela();

        $('resultado').hidden = false;
        prepararGrafico(m);
    }

    function marcarAba() {
        document.querySelectorAll('#abas button').forEach(function (b) {
            b.classList.toggle('ativa', b.getAttribute('data-aba') === abaAtual);
        });
    }

    document.querySelectorAll('#abas button').forEach(function (btn) {
        btn.addEventListener('click', function () {
            abaAtual = btn.getAttribute('data-aba');
            marcarAba();
            renderizarTabela();
        });
    });

    function renderizarTabela() {
        if (!modelo) return;
        var anual = abaAtual === 'anual';
        var linhas = anual ? modelo.anual : modelo.mensal.slice(1);
        var ultima = modelo.colunas.length - 1;

        var html = '<thead><tr><th>' + (anual ? 'Ano' : 'Mês') + '</th>' + modelo.colunas.map(function (c) {
            return '<th>' + esc(c.titulo) + '</th>';
        }).join('') + '</tr></thead><tbody>';

        html += linhas.map(function (l) {
            var rotulo = anual ? (l.mes % 12 === 0 ? l.ano : 'Mês ' + l.mes) : l.mes;
            return '<tr' + (l.retirada > 0 ? ' class="em-retirada"' : '') + '><td>' + rotulo + '</td>' +
                modelo.colunas.map(function (c, i) {
                    var v = C.moeda(l[c.campo]);
                    return '<td>' + (i === ultima ? '<b>' + v + '</b>' : v) + '</td>';
                }).join('') + '</tr>';
        }).join('');

        $('tabela').innerHTML = html + '</tbody>';
        $('tabela').parentNode.scrollTop = 0;
    }

    /* ---------- Gráfico (canvas) ---------- */
    var canvas = $('grafico');
    var ctx = canvas.getContext('2d');
    var tooltip = $('tooltip');
    var moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    var compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

    var g = null; // estado do gráfico: { pts, n, series, escala, area }
    var hover = -1;

    function prepararGrafico(m) {
        $('legenda').innerHTML = m.series.map(function (s) {
            return '<span><i style="background:' + s.cor + '"></i>' + esc(s.nome) + '</span>';
        }).join('');

        g = {
            pts: m.mensal,
            n: m.mensal.length - 1,
            series: m.series,
            escala: escalaEixo(m.mensal, m.series.map(function (s) { return s.campo; })),
            area: {}
        };
        hover = -1;
        tooltip.hidden = true;
        desenhar();
    }

    function rotuloMes(m) {
        if (m === 0) return 'Início';
        if (g.n <= 24) return 'Mês ' + m;
        var a = Math.floor(m / 12), r = m % 12;
        return r === 0 ? 'Ano ' + a : 'Ano ' + a + ', mês ' + r;
    }

    function desenhar() {
        if (!g || $('resultado').hidden) return;
        var dpr = window.devicePixelRatio || 1;
        var w = canvas.clientWidth, h = 320;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        var area = g.area = { x: 70, y: 12, w: w - 86, h: h - 44 };
        var topo = g.escala.topo, n = g.n, pts = g.pts;
        var X = function (i) { return area.x + (n ? i / n : 0) * area.w; };
        var Y = function (v) { return area.y + area.h - (v / topo) * area.h; };

        ctx.font = '12px Segoe UI, Arial, sans-serif';
        ctx.textBaseline = 'middle';

        // grade horizontal + eixo Y
        for (var v = 0; v <= topo + 1e-6; v += g.escala.passo) {
            ctx.strokeStyle = '#e9ecef';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(area.x, Math.round(Y(v)) + .5);
            ctx.lineTo(area.x + area.w, Math.round(Y(v)) + .5);
            ctx.stroke();
            ctx.fillStyle = '#6c757d';
            ctx.textAlign = 'right';
            ctx.fillText('R$ ' + compacto.format(v), area.x - 8, Y(v));
        }

        // eixo X
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (n <= 24) {
            var pm = n <= 12 ? 1 : 2;
            for (var m = 0; m <= n; m += pm) ctx.fillText(m + 'm', X(m), area.y + area.h + 8);
        } else {
            var pa = Math.max(1, Math.ceil((n / 12) / Math.max(2, Math.floor(area.w / 70))));
            for (var a = 0; a * 12 <= n; a += pa) ctx.fillText(a + 'a', X(a * 12), area.y + area.h + 8);
        }

        // área sob a primeira série (saldo)
        var principal = g.series[0].campo;
        var grad = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
        grad.addColorStop(0, 'rgba(47,111,62,.18)');
        grad.addColorStop(1, 'rgba(47,111,62,0)');
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        pts.forEach(function (l, i) { ctx.lineTo(X(i), Y(l[principal])); });
        ctx.lineTo(X(n), Y(0));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // linhas
        ctx.lineJoin = 'round';
        g.series.slice().reverse().forEach(function (s) {
            ctx.strokeStyle = s.cor;
            ctx.lineWidth = s.campo === principal ? 2.5 : 2;
            ctx.beginPath();
            pts.forEach(function (l, i) {
                if (i) ctx.lineTo(X(i), Y(l[s.campo])); else ctx.moveTo(X(i), Y(l[s.campo]));
            });
            ctx.stroke();
        });

        // destaque do hover
        if (hover >= 0) {
            ctx.strokeStyle = 'rgba(33,37,41,.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(X(hover)) + .5, area.y);
            ctx.lineTo(Math.round(X(hover)) + .5, area.y + area.h);
            ctx.stroke();
            g.series.forEach(function (s) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = s.cor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(X(hover), Y(pts[hover][s.campo]), 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }
    }

    canvas.addEventListener('mousemove', function (ev) {
        if (!g) return;
        var area = g.area, n = g.n;
        var x = ev.clientX - canvas.getBoundingClientRect().left;
        if (x < area.x - 10 || x > area.x + area.w + 10) return esconderTooltip();
        var i = Math.max(0, Math.min(n, Math.round(((x - area.x) / area.w) * n)));
        if (i !== hover) {
            hover = i;
            desenhar();
        }
        var l = g.pts[i];
        tooltip.innerHTML = '<b>' + rotuloMes(l.mes) + '</b><br>' + g.series.map(function (s) {
            return '<i style="background:' + s.cor + '"></i>' + esc(s.nome) + ': ' + moeda.format(l[s.campo]);
        }).join('<br>');
        tooltip.hidden = false;
        var px = area.x + (n ? i / n : 0) * area.w + 24;
        if (px + tooltip.offsetWidth > canvas.clientWidth) px -= tooltip.offsetWidth + 28;
        tooltip.style.left = px + 'px';
        tooltip.style.top = '20px';
    });

    function esconderTooltip() {
        tooltip.hidden = true;
        if (hover !== -1) {
            hover = -1;
            desenhar();
        }
    }
    canvas.addEventListener('mouseleave', esconderTooltip);

    var t;
    window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(desenhar, 100);
    });
})();
