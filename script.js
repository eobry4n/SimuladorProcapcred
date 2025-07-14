// === CONFIGURAÇÕES E CONSTANTES ===
const CONFIGURACOES = {
  TAXA_POUPANCA_MENSAL: 0.005,
  API_SELIC: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4189/dados/ultimos/1?formato=json",
  SELIC_PADRAO: 10.5,
  
  IOF: {
    ADICIONAL: 0.0038,
    PF_TAXA_DIARIA: 0.000082, // Taxa para Pessoa Física
    PJ_TAXA_DIARIA: 0.000041  // Taxa para Pessoa Jurídica
  },
  
  SEGURO_TAXA_PROPORCIONAL: 0
};

// === UTILITÁRIOS ===
const formatarMoeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarPorcentagem = (valor) => {
  if (isNaN(valor) || !isFinite(valor)) return 'Inválido';
  return (valor * 100).toFixed(2).replace('.', ',') + '%';
};

// === FUNÇÕES DE INPUT ===
function formatInputAsNumber(input) {
  let value = input.value.replace(/[^0-9.,]/g, '');
  const parts = value.split(/[.,]/);
  if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
  else if (parts.length === 2 && value.includes(',')) value = parts[0] + '.' + parts[1];
  input.value = value;
}

function formatInputAsCurrency(input) {
  let value = input.value.replace(/[R$\s.]/g, '').replace(',', '.');
  value = parseFloat(value);
  input.value = !isNaN(value) ? formatarMoeda(value) : '';
}

// === DADOS GLOBAIS E API ===
let taxaSelicAtual = CONFIGURACOES.SELIC_PADRAO;
let tipoCliente = 'PJ'; // Estado inicial padrão

async function buscarTaxaSelic() {
  try {
    const resposta = await fetch(CONFIGURACOES.API_SELIC);
    const dados = await resposta.json();
    taxaSelicAtual = parseFloat(dados[0].valor.replace(',', '.'));
  } catch (erro) {
    console.warn('⚠️ Erro ao buscar SELIC, usando taxa padrão:', erro);
  }
}

// === CÁLCULOS FINANCEIROS ===
function calcularTaxaJurosFinal(tipo, custo, bndes, agente) {
  const fatorCusto = 1 + (custo / 100);
  const fatorBndes = 1 + (bndes / 100);
  if (tipo === 'indireta') {
    const fatorAgente = 1 + (agente / 100);
    return (fatorCusto * fatorBndes * fatorAgente) - 1;
  }
  return (fatorCusto * fatorBndes) - 1;
}

function calcularIOF(valor, meses) {
  const dias = Math.min(meses * 30, 365);
  const taxaDiaria = (tipoCliente === 'PF') 
    ? CONFIGURACOES.IOF.PF_TAXA_DIARIA 
    : CONFIGURACOES.IOF.PJ_TAXA_DIARIA;
  const iofDiario = valor * taxaDiaria * dias;
  const iofAdicional = valor * CONFIGURACOES.IOF.ADICIONAL;
  return iofDiario + iofAdicional;
}

function calcularSeguro(valor, meses) {
  return valor * CONFIGURACOES.SEGURO_TAXA_PROPORCIONAL * meses;
}

function calcularVPL(taxa, fluxos) {
  let vpl = fluxos[0];
  for (let i = 1; i < fluxos.length; i++) {
    vpl += fluxos[i] / Math.pow(1 + taxa, i);
  }
  return vpl;
}

function calcularTIR(fluxosDeCaixa) {
  let taxaMin = 0.0, taxaMax = 1.0, taxaMedia = 0.0;
  const precisao = 1e-7, maxIteracoes = 100;
  if (calcularVPL(taxaMin, fluxosDeCaixa) * calcularVPL(taxaMax, fluxosDeCaixa) >= 0) {
    return NaN;
  }
  for (let i = 0; i < maxIteracoes; i++) {
    taxaMedia = (taxaMin + taxaMax) / 2;
    let vplMedia = calcularVPL(taxaMedia, fluxosDeCaixa);
    if (Math.abs(vplMedia) < precisao) return taxaMedia;
    if (calcularVPL(taxaMin, fluxosDeCaixa) * vplMedia < 0) taxaMax = taxaMedia;
    else taxaMin = taxaMedia;
  }
  return taxaMedia;
}

function calcularRemuneracaoCapitalSocial(capital, selicAnual, meses) {
  return capital * (selicAnual / 100) * (meses / 12);
}

function gerarPlanoAmortizacaoSAC(valorFinanciado, taxaMensal, meses) {
  const plano = [];
  let saldoDevedor = valorFinanciado;
  const amortizacaoConstante = valorFinanciado / meses;
  for (let i = 1; i <= meses; i++) {
    const jurosParcela = saldoDevedor * taxaMensal;
    const valorParcela = amortizacaoConstante + jurosParcela;
    saldoDevedor -= amortizacaoConstante;
    plano.push({
      parcela: i, valorParcela, juros: jurosParcela, amortizacao: amortizacaoConstante,
      saldoDevedor: saldoDevedor > 0.01 ? saldoDevedor : 0
    });
  }
  return plano;
}

// === FUNÇÃO PRINCIPAL DE SIMULAÇÃO ===
async function calcularSimulacao() {
  try {
    const valorSolicitado = parseFloat(document.getElementById("valor").value.replace(/[R$\s.]/g, '').replace(',', '.'));
    const mesesFinanciamento = parseInt(document.getElementById("meses").value);
    
    if (isNaN(valorSolicitado) || isNaN(mesesFinanciamento) || valorSolicitado <= 0 || mesesFinanciamento <= 0) {
      mostrarMensagem('⚠️ Por favor, preencha valor e prazo válidos!', 'warning');
      return;
    }
    const tipoOperacao = document.querySelector('input[name="tipoOperacao"]:checked').value;
    const custoFinanceiro = parseFloat(document.getElementById("custoFinanceiro").value) || 0;
    const taxaBndes = parseFloat(document.getElementById("taxaBndes").value) || 0;
    const taxaAgente = parseFloat(document.getElementById("taxaAgente").value) || 0;

    await buscarTaxaSelic();

    const taxaNominalAnual = calcularTaxaJurosFinal(tipoOperacao, custoFinanceiro, taxaBndes, taxaAgente);
    const taxaNominalMensal = Math.pow(1 + taxaNominalAnual, 1/12) - 1;
    
    const iof = calcularIOF(valorSolicitado, mesesFinanciamento);
    const seguro = calcularSeguro(valorSolicitado, mesesFinanciamento);
    const totalDespesas = iof + seguro;
    const valorLiquidoRecebido = valorSolicitado - totalDespesas;

    const planoAmortizacao = gerarPlanoAmortizacaoSAC(valorSolicitado, taxaNominalMensal, mesesFinanciamento);
    const listaDeParcelas = planoAmortizacao.map(p => p.valorParcela);

    const fluxosDeCaixa = [valorLiquidoRecebido, ...listaDeParcelas.map(p => -p)];
    
    const cetMensal = calcularTIR(fluxosDeCaixa);
    const cetAnual = Math.pow(1 + cetMensal, 12) - 1;

    const valorTotalPago = listaDeParcelas.reduce((acc, curr) => acc + curr, 0);
    const custoTotalEmprestimo = valorTotalPago - valorLiquidoRecebido;
    
    const remuneracaoCapitalSocial = calcularRemuneracaoCapitalSocial(valorSolicitado, taxaSelicAtual, mesesFinanciamento);
    const jurosCompostos = (c, t, m) => c * Math.pow(1 + t, m);
    const rendimentoPoupanca = jurosCompostos(valorSolicitado, CONFIGURACOES.TAXA_POUPANCA_MENSAL, mesesFinanciamento) - valorSolicitado;
    const resultadoLiquido = remuneracaoCapitalSocial - custoTotalEmprestimo;
    
    exibirResultados({ 
      valorFinanciado: valorSolicitado, mesesFinanciamento, taxaSelicAtual,
      totalParcelasPagas: valorTotalPago, jurosTotais: valorTotalPago - valorSolicitado, 
      iof, seguro, remuneracaoCapitalSocial, rendimentoPoupanca, resultadoLiquido, cetAnual, 
      custoTotal: custoTotalEmprestimo, valorTotalPago, planoAmortizacao
    });
  } catch(error) {
    console.error("Ocorreu um erro durante a simulação:", error);
    mostrarMensagem("❌ Erro inesperado. Verifique o console.", "warning");
  }
}

// === Funções de UI e Exibição ===
function toggleAgentRate() {
  const tipoOperacao = document.querySelector('input[name="tipoOperacao"]:checked').value;
  const agentRateGroup = document.getElementById('agentRateGroup');
  if (tipoOperacao === 'direta') {
    agentRateGroup.style.display = 'none';
    document.getElementById('taxaAgente').value = '0'; 
  } else {
    agentRateGroup.style.display = 'block';
    if (document.getElementById('taxaAgente').value === '0') document.getElementById('taxaAgente').value = '3';
  }
}

function toggleAdvancedSettings() {
  const advancedSettingsDiv = document.getElementById('advancedSettings');
  advancedSettingsDiv.style.display = (advancedSettingsDiv.style.display === 'none') ? 'block' : 'none';
}

function exibirResultados(dados) {
    document.getElementById("resultados").style.display = "block";
    document.getElementById("resultados").scrollIntoView({ behavior: 'smooth' });
    const descricaoAdicional = `Este valor de rentabilidade é referente ao período de ${dados.mesesFinanciamento} meses e acompanha a taxa SELIC atual (${(dados.taxaSelicAtual).toFixed(2).replace('.',',')}% a.a.) do dia da simulação.`;
    const resultadoPrincipal = document.getElementById("resultado-principal");
    if (dados.resultadoLiquido > 0) {
        resultadoPrincipal.querySelector("#resultado-icon").textContent = "🎉";
        resultadoPrincipal.querySelector("#resultado-titulo").textContent = "Excelente Negócio!";
        resultadoPrincipal.querySelector("#resultado-valor").textContent = `+${formatarMoeda(dados.resultadoLiquido)}`;
        resultadoPrincipal.querySelector("#resultado-descricao").innerHTML = `Você terá lucro líquido investindo no capital social! <br>${descricaoAdicional}`;
        resultadoPrincipal.style.background = "linear-gradient(135deg, #48bb78 0%, #38a169 100%)";
    } else if (dados.resultadoLiquido > -100) {
        resultadoPrincipal.querySelector("#resultado-icon").textContent = "⚖️";
        resultadoPrincipal.querySelector("#resultado-titulo").textContent = "Resultado Equilibrado";
        resultadoPrincipal.querySelector("#resultado-valor").textContent = formatarMoeda(dados.resultadoLiquido);
        resultadoPrincipal.querySelector("#resultado-descricao").innerHTML = `O investimento quase cobre os custos do empréstimo. <br>${descricaoAdicional}`;
        resultadoPrincipal.style.background = "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)";
    } else {
        resultadoPrincipal.querySelector("#resultado-icon").textContent = "⚠️";
        resultadoPrincipal.querySelector("#resultado-titulo").textContent = "Atenção!";
        resultadoPrincipal.querySelector("#resultado-valor").textContent = formatarMoeda(dados.resultadoLiquido);
        resultadoPrincipal.querySelector("#resultado-descricao").innerHTML = `A remuneração não cobrirá os custos do empréstimo. <br>${descricaoAdicional}`;
        resultadoPrincipal.style.background = "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)";
    }
    exibirComparativo(dados);
    exibirResumoComparativo(dados);
    exibirGrafico(dados);
    exibirGraficoAmortizacao(dados.planoAmortizacao);
    exibirParcelas(dados.planoAmortizacao);
    configurarBotoesPartilha(dados);
}

function exibirComparativo(dados) {
    document.getElementById("comparativo").innerHTML = `
        <div class="comparison-card" title="Custo total do empréstimo"><div class="comparison-icon">💸</div><div class="comparison-title">Custo Total do Empréstimo</div><div class="comparison-value">${formatarMoeda(dados.custoTotal)}</div><div>Juros + IOF + Seguro</div></div>
        <div class="comparison-card" title="Remuneração do capital social"><div class="comparison-icon">💰</div><div class="comparison-title">Remuneração do Capital Social</div><div class="comparison-value">${formatarMoeda(dados.remuneracaoCapitalSocial)}</div><div>100% da SELIC no período</div></div>
        <div class="comparison-card" title="Rendimento na poupança"><div class="comparison-icon">🏦</div><div class="comparison-title">Rendimento Potencial na Poupança</div><div class="comparison-value">${formatarMoeda(dados.rendimentoPoupanca)}</div><div>Se o valor fosse investido</div></div>
        <div class="comparison-card" title="Custo Efetivo Total anual"><div class="comparison-icon">📊</div><div class="comparison-title">CET (Custo Efetivo Total) Anual</div><div class="comparison-value">${formatarPorcentagem(dados.cetAnual)}</div><div>Custo real anual do crédito</div></div>`;
}

function exibirResumoComparativo(dados) {
    const summaryDiv = document.getElementById("summary-comparison");
    const infoPrazoSelic = `A rentabilidade do capital social é calculada para ${dados.mesesFinanciamento} meses com a SELIC de ${(dados.taxaSelicAtual).toFixed(2).replace('.',',')}% a.a.`;
    const infoCetNominal = `O CET de ${formatarPorcentagem(dados.cetAnual)} reflete o custo real, incluindo IOF (${formatarMoeda(dados.iof)}) e Seguro (${formatarMoeda(dados.seguro)}).`;
    summaryDiv.innerHTML = (dados.resultadoLiquido > 0) 
        ? `🎉 **Excelente!** O investimento pode gerar um lucro de ${formatarMoeda(dados.resultadoLiquido)}. ${infoPrazoSelic} <br><br> ${infoCetNominal}`
        : `⚠️ **Atenção!** O custo do empréstimo supera a remuneração. ${infoPrazoSelic} <br><br> ${infoCetNominal}`;
    summaryDiv.className = `summary-section ${dados.resultadoLiquido > 0 ? 'positive' : 'negative'}`;
}

function exibirGrafico(dados) {
  const canvas = document.getElementById("grafico");
  if (window.meuGrafico) window.meuGrafico.destroy();
  window.meuGrafico = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['💸 Custo Total', '💰 Remuneração Capital', '🏦 Rend. Poupança'],
      datasets: [{ data: [dados.custoTotal, dados.remuneracaoCapitalSocial, dados.rendimentoPoupanca], backgroundColor: ['#f56565', '#48bb78', '#4299e1'] }]
    },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatarMoeda(c.raw) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatarMoeda(v) } } }
    }
  });
}

function exibirGraficoAmortizacao(plano) {
    const canvas = document.getElementById("grafico-amortizacao");
    if (window.meuGraficoAmortizacao) window.meuGraficoAmortizacao.destroy();
    window.meuGraficoAmortizacao = new Chart(canvas, {
        type: 'line',
        data: {
            labels: plano.map(p => `Mês ${p.parcela}`),
            datasets: [
                { label: 'Juros', data: plano.map(p => p.juros), borderColor: '#f56565', tension: 0.1, fill: true, backgroundColor: 'rgba(245, 101, 101, 0.2)' },
                { label: 'Amortização', data: plano.map(p => p.amortizacao), borderColor: '#4299e1', tension: 0.1, fill: true, backgroundColor: 'rgba(66, 153, 225, 0.2)' },
                { label: 'Saldo Devedor', data: plano.map(p => p.saldoDevedor), borderColor: '#48bb78', tension: 0.1 }
            ]
        },
        options: { responsive: true, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatarMoeda(c.raw)}` } } },
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatarMoeda(v) } } }
        }
    });
}

function exibirParcelas(plano) {
  const grid = document.getElementById("parcelas-grid");
  grid.innerHTML = '';
  plano.forEach(p => {
    grid.innerHTML += `<tr><td data-label="Parcela">${p.parcela}</td><td data-label="Valor da Parcela">${formatarMoeda(p.valorParcela)}</td><td data-label="Juros">${formatarMoeda(p.juros)}</td><td data-label="Amortização">${formatarMoeda(p.amortizacao)}</td><td data-label="Saldo Devedor">${formatarMoeda(p.saldoDevedor)}</td></tr>`;
  });
}

function configurarBotoesPartilha(dados) {
    const message = `Simulação Procapcred (SAC):\n- Valor: ${formatarMoeda(dados.valorFinanciado)}\n- Prazo: ${dados.mesesFinanciamento} meses\n- Lucro Líquido: ${formatarMoeda(dados.resultadoLiquido)}\n- CET Anual: ${formatarPorcentagem(dados.cetAnual)}`;
    document.getElementById('share-whatsapp').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    document.getElementById('share-email').href = `mailto:?subject=Simulação Procapcred&body=${encodeURIComponent(message)}`;
}

function mostrarMensagem(mensagem, tipo = 'info') {
  let box = document.getElementById('message-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'message-box';
    Object.assign(box.style, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      padding: '15px 25px', borderRadius: '10px', zIndex: '1000', color: 'white',
      boxShadow: '0 5px 15px rgba(0,0,0,0.2)', transition: 'all 0.5s'
    });
    document.body.appendChild(box);
  }
  box.style.backgroundColor = tipo === 'warning' ? '#f0ad4e' : '#5cb85c';
  box.textContent = mensagem;
  box.style.opacity = '1';
  box.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => {
    box.style.opacity = '0';
    box.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => { if(box) box.remove(); }, 500);
  }, 3000);
}

// === INICIALIZAÇÃO DA PÁGINA ===
document.addEventListener('DOMContentLoaded', () => {
  // Configura os botões PF/PJ
  const btnPj = document.getElementById('btn-pj');
  const btnPf = document.getElementById('btn-pf');

  btnPj.addEventListener('click', () => {
      tipoCliente = 'PJ';
      btnPj.classList.add('active');
      btnPf.classList.remove('active');
  });

  btnPf.addEventListener('click', () => {
      tipoCliente = 'PF';
      btnPf.classList.add('active');
      btnPj.classList.remove('active');
  });
  
  // Funções iniciais
  buscarTaxaSelic();
  toggleAgentRate();
});