/**
 * Cálculo de juros compostos com depósitos e retiradas mensais.
 *
 * Ordem de cada mês:
 *   1. juros incidem sobre o saldo do início do mês
 *   2. entra o depósito mensal (se ainda estiver na fase de depósitos)
 *   3. sai a retirada mensal (se já estiver na fase de retiradas), limitada ao saldo
 *      - fixo: valor em R$
 *      - bruta: % do valor total (saldo com os juros)
 *      - líquida: % do saldo sem os juros acumulados
 */
var Calculadora = (function () {
    'use strict';

    var MAX_MESES = 1200; // 100 anos

    var fmtMoeda = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /** "10.000,00" / "10000.5" / "0,8" -> número */
    function numero(valor) {
        var v = String(valor == null ? '' : valor).replace(/R\$|%|\s| /g, '');
        if (v === '') return 0;
        if (v.indexOf(',') !== -1) v = v.replace(/\./g, '').replace(',', '.');
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function moeda(v) {
        return 'R$ ' + fmtMoeda.format(v);
    }

    function percentual(v, casas) {
        return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas == null ? 4 : casas }).format(v * 100) + '%';
    }

    function totalMeses(p) {
        return p.periodo_tipo === 'anos' ? p.periodo * 12 : p.periodo;
    }

    function taxaMensal(p) {
        var t = p.taxa / 100;
        return p.taxa_tipo === 'anual' ? Math.pow(1 + t, 1 / 12) - 1 : t;
    }

    /** Mês (1..n) em que a primeira retirada acontece. */
    function mesInicioRetirada(p) {
        return (p.retirada_apos_tipo === 'anos' ? p.retirada_apos * 12 : p.retirada_apos) + 1;
    }

    /** Normaliza a entrada do formulário. Retorna { p, erros }. */
    function entrada(src) {
        var p = {
            valor_inicial: numero(src.valor_inicial),
            deposito_mensal: numero(src.deposito_mensal),
            retirada_ativa: !!src.retirada_ativa,
            retirada_mensal: numero(src.retirada_mensal),
            retirada_tipo: src.retirada_tipo === 'liquida' || src.retirada_tipo === 'bruta' ? src.retirada_tipo : 'fixo',
            retirada_apos: Math.trunc(numero(src.retirada_apos)),
            retirada_apos_tipo: src.retirada_apos_tipo === 'meses' ? 'meses' : 'anos',
            parar_depositos: !!src.parar_depositos,
            taxa: numero(src.taxa),
            taxa_tipo: src.taxa_tipo === 'mensal' ? 'mensal' : 'anual',
            periodo: Math.trunc(numero(src.periodo)),
            periodo_tipo: src.periodo_tipo === 'meses' ? 'meses' : 'anos'
        };
        if (!p.retirada_ativa) p.retirada_mensal = 0;

        var erros = [];
        if (p.valor_inicial < 0 || p.deposito_mensal < 0 || p.retirada_mensal < 0 || p.taxa < 0) {
            erros.push('Valores não podem ser negativos.');
        }
        if (p.valor_inicial <= 0 && p.deposito_mensal <= 0) erros.push('Informe o valor inicial ou o valor mensal.');
        if (p.periodo <= 0) erros.push('Informe o período.');
        if (totalMeses(p) > MAX_MESES) erros.push('Período máximo: 100 anos (1200 meses).');
        if (p.retirada_ativa && p.retirada_mensal <= 0) erros.push('Informe o valor da retirada mensal.');
        if (p.retirada_ativa && p.retirada_tipo !== 'fixo' && p.retirada_mensal > 100) erros.push('A retirada em % não pode passar de 100%.');
        if (p.retirada_ativa && p.retirada_apos < 0) erros.push('O início das retiradas não pode ser negativo.');

        return { p: p, erros: erros };
    }

    function calcular(p) {
        var meses = totalMeses(p);
        var taxa = taxaMensal(p);
        var inicioRet = p.retirada_ativa ? mesInicioRetirada(p) : Infinity;

        var saldo = p.valor_inicial;
        var investido = p.valor_inicial;
        var jurosAcum = 0;
        var retirado = 0;
        var esgotadoMes = null;
        var saldoInicioRetiradas = null;

        var mensal = [{
            mes: 0, juros: 0, deposito: 0, retirada: 0,
            investido: investido, juros_acum: 0, retirado: 0, saldo: saldo
        }];

        for (var m = 1; m <= meses; m++) {
            var faseRetirada = m >= inicioRet;
            if (faseRetirada && saldoInicioRetiradas === null) saldoInicioRetiradas = saldo;

            var juros = saldo * taxa;
            saldo += juros;
            jurosAcum += juros;

            var deposito = (faseRetirada && p.parar_depositos) ? 0 : p.deposito_mensal;
            saldo += deposito;
            investido += deposito;

            var retirada = 0;
            if (faseRetirada) {
                var desejada = p.retirada_mensal;
                if (p.retirada_tipo === 'bruta') desejada = saldo * p.retirada_mensal / 100;
                else if (p.retirada_tipo === 'liquida') desejada = Math.max(0, saldo - jurosAcum) * p.retirada_mensal / 100;
                retirada = Math.min(desejada, saldo);
                saldo -= retirada;
                retirado += retirada;
                if (saldo < 0.005) {
                    saldo = 0;
                    if (esgotadoMes === null) esgotadoMes = m;
                }
            }

            mensal.push({
                mes: m, juros: juros, deposito: deposito, retirada: retirada,
                investido: investido, juros_acum: jurosAcum, retirado: retirado, saldo: saldo
            });
        }

        // Agrupamento anual (mês 12, 24, ... e o último mês se não fechar o ano)
        var anual = [];
        var acc = { juros: 0, deposito: 0, retirada: 0 };
        for (var i = 1; i <= meses; i++) {
            var l = mensal[i];
            acc.juros += l.juros;
            acc.deposito += l.deposito;
            acc.retirada += l.retirada;
            if (i % 12 === 0 || i === meses) {
                anual.push(Object.assign({}, l, acc, { ano: Math.ceil(i / 12) }));
                acc = { juros: 0, deposito: 0, retirada: 0 };
            }
        }

        return {
            meses: meses,
            taxa_mensal: taxa,
            taxa_anual: Math.pow(1 + taxa, 12) - 1,
            inicio_retirada: p.retirada_ativa ? inicioRet : null,
            saldo_inicio_retiradas: saldoInicioRetiradas,
            esgotado_mes: esgotadoMes,
            saldo_final: saldo,
            investido: investido,
            juros: jurosAcum,
            retirado: retirado,
            renda_mensal: saldo * taxa, // retirada que preserva o saldo final
            mensal: mensal,
            anual: anual
        };
    }

    /** "1 ano e 3 meses" */
    function descreverMeses(meses) {
        var a = Math.floor(meses / 12), m = meses % 12, partes = [];
        if (a) partes.push(a + (a === 1 ? ' ano' : ' anos'));
        if (m || !a) partes.push(m + (m === 1 ? ' mês' : ' meses'));
        return partes.join(' e ');
    }

    /* =====================================================================
     * Modo avançado: planejamento de meta
     *
     * Meta = valor final informado OU patrimônio que paga a renda desejada
     * (corrigida pela inflação) para sempre, sem perder poder de compra:
     *     patrimônio = renda_futura / (taxa_efetiva - inflação)
     * Todo mês na fase de renda: rendimento - IR = renda + reinvestimento,
     * e o reinvestimento (patrimônio × inflação) mantém o poder de compra.
     *
     * Incógnita = depósito mensal (quando o período é informado)
     *          OU período (quando o depósito é informado).
     * ===================================================================== */

    function entradaAvancada(src) {
        var p = {
            valor_inicial: numero(src.valor_inicial),
            valor_final: numero(src.valor_final),
            renda_hoje: numero(src.renda_hoje),
            // alíquota de IR sobre os rendimentos da fase de renda (0 = isento)
            ir: src.ir_tipo === 'outra' ? numero(src.ir_outra) / 100 : numero(src.ir_tipo) / 100,
            deposito_mensal: numero(src.deposito_mensal),
            corrigir_deposito: !!src.corrigir_deposito,
            taxa: numero(src.taxa),
            taxa_tipo: src.taxa_tipo === 'mensal' ? 'mensal' : 'anual',
            periodo: Math.trunc(numero(src.periodo)),
            periodo_tipo: src.periodo_tipo === 'meses' ? 'meses' : 'anos',
            inflacao: numero(src.inflacao)
        };

        // Campos mutuamente exclusivos: vale o que estiver preenchido
        if (p.valor_final > 0) p.renda_hoje = 0;
        if (p.renda_hoje <= 0) p.ir = 0;
        if (p.deposito_mensal > 0) p.periodo = 0;

        var erros = [];
        if (p.valor_inicial < 0 || p.valor_final < 0 || p.renda_hoje < 0 || p.deposito_mensal < 0 || p.taxa < 0) {
            erros.push('Valores não podem ser negativos.');
        }
        if (p.valor_final <= 0 && p.renda_hoje <= 0) erros.push('Informe o valor final ou a renda desejada hoje.');
        if (p.deposito_mensal <= 0 && p.periodo <= 0) erros.push('Informe o valor mensal para guardar ou o período.');
        if (p.taxa <= 0) erros.push('Informe a taxa de juros.');
        if (p.ir < 0 || p.ir >= 1) erros.push('Alíquota de IR inválida.');
        if (p.periodo > 0 && totalMeses(p) > MAX_MESES) erros.push('Período máximo: 100 anos (1200 meses).');

        if (!erros.length && p.renda_hoje > 0) {
            var t = taxasAvancada(p);
            if (t.efetiva <= t.inflacao) {
                erros.push('A taxa de juros' + (p.ir > 0 ? ' (já descontado o IR)' : '') +
                    ' precisa ser maior que a inflação para a renda manter o poder de compra.');
            }
        }

        return { p: p, erros: erros };
    }

    function taxasAvancada(p) {
        var juros = taxaMensal(p);
        return {
            juros: juros,
            inflacao: Math.pow(1 + p.inflacao / 100, 1 / 12) - 1,
            efetiva: juros * (1 - p.ir)
        };
    }

    function calcularAvancada(p) {
        var t = taxasAvancada(p);
        var r = t.juros, g = t.inflacao;

        var porRenda = p.renda_hoje > 0;
        function rendaEm(m) { return p.renda_hoje * Math.pow(1 + g, m); }
        function metaEm(m) { return porRenda ? rendaEm(m) / (t.efetiva - g) : p.valor_final; }
        function depositoNoMes(base, m) { return p.corrigir_deposito ? base * Math.pow(1 + g, m - 1) : base; }

        var meses, deposito;

        if (p.periodo > 0) {
            // Período conhecido -> depósito necessário (FV é linear no depósito)
            meses = totalMeses(p);
            var fatorDeposito = 0;
            for (var k = 1; k <= meses; k++) fatorDeposito += depositoNoMes(1, k) * Math.pow(1 + r, meses - k);
            var falta = metaEm(meses) - p.valor_inicial * Math.pow(1 + r, meses);
            deposito = Math.max(0, falta / fatorDeposito);
        } else {
            // Depósito conhecido -> primeiro mês em que o saldo alcança a meta
            deposito = p.deposito_mensal;
            if (p.valor_inicial >= metaEm(0)) {
                return { erro: 'O valor inicial já é suficiente para a meta.' };
            }
            var saldo = p.valor_inicial;
            meses = null;
            for (var m = 1; m <= MAX_MESES; m++) {
                saldo = saldo * (1 + r) + depositoNoMes(deposito, m);
                if (saldo >= metaEm(m) - 0.005) { meses = m; break; }
            }
            if (meses === null) {
                return { erro: 'Com esse valor mensal a meta não é alcançada em 100 anos. Aumente o valor mensal ou a taxa.' };
            }
        }

        // Série mês a mês
        var s = p.valor_inicial, investido = p.valor_inicial, jurosAcum = 0, ultimoDeposito = 0;
        var mensal = [{
            mes: 0, juros: 0, deposito: 0, investido: investido, juros_acum: 0, saldo: s, saldo_hoje: s
        }];
        for (var i = 1; i <= meses; i++) {
            var juros = s * r;
            var dep = depositoNoMes(deposito, i);
            s += juros + dep;
            investido += dep;
            jurosAcum += juros;
            ultimoDeposito = dep;
            mensal.push({
                mes: i, juros: juros, deposito: dep, investido: investido, juros_acum: jurosAcum,
                saldo: s, saldo_hoje: s / Math.pow(1 + g, i)
            });
        }

        var anual = [], acc = { juros: 0, deposito: 0 };
        for (i = 1; i <= meses; i++) {
            acc.juros += mensal[i].juros;
            acc.deposito += mensal[i].deposito;
            if (i % 12 === 0 || i === meses) {
                anual.push(Object.assign({}, mensal[i], acc, { ano: Math.ceil(i / 12) }));
                acc = { juros: 0, deposito: 0 };
            }
        }

        // Fase de renda (a partir do saldo final)
        var patrimonio = s;
        var rendimento = patrimonio * r;
        var imposto = rendimento * p.ir;
        var reinvestir = patrimonio * g;
        var renda = rendimento - imposto - reinvestir;

        return {
            meses: meses,
            taxa_mensal: r,
            taxa_anual: Math.pow(1 + r, 12) - 1,
            inflacao_mensal: g,
            deposito: deposito,
            deposito_final: ultimoDeposito,
            meta: metaEm(meses),
            saldo_final: patrimonio,
            saldo_final_hoje: patrimonio / Math.pow(1 + g, meses),
            investido: investido,
            juros: jurosAcum,
            renda_futura: porRenda ? rendaEm(meses) : null,
            fase_renda: {
                rendimento: rendimento,
                imposto: imposto,
                reinvestir: reinvestir,
                renda: renda,
                renda_hoje: renda / Math.pow(1 + g, meses)
            },
            mensal: mensal,
            anual: anual
        };
    }

    return {
        numero: numero, moeda: moeda, percentual: percentual, entrada: entrada,
        calcular: calcular, descreverMeses: descreverMeses,
        entradaAvancada: entradaAvancada, calcularAvancada: calcularAvancada
    };
})();
