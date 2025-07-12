// === CONFIGURAÇÕES E CONSTANTES ===
const CONFIGURACOES = {
  // A TAXA_PROCAPCRED_ANUAL agora será calculada dinamicamente.
  
  // Taxa da poupança (aproximadamente 0,5% ao mês)
  TAXA_POUPANCA_MENSAL: 0.005,
  
  // URL da API do Banco Central para buscar a SELIC
  API_SELIC: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4189/dados/ultimos/1?formato=json",
  
  // Taxa SELIC padrão caso a API não funcione
  SELIC_PADRAO: 10.5, // Em porcentagem, ex: 10.5 para 10.5%
  
  // Taxa de IOF (0,0041% ao dia nos primeiros 30 dias + 0,38% adicional)
  IOF_TAXA_DIARIA: 0.000041, // 0.0041%
  IOF_ADICIONAL: 0.0038,     // 0.38%
  
  // Taxa de seguro: 0,066% do valor da operação * o prazo
  SEGURO_TAXA_PROPORCIONAL: 0.00066 // 0.066%
};

// === UTILITÁRIOS ===
/**
 * Formata um número para moeda brasileira
 * Exemplo: 1500.50 → "R$ 1.500,50"
 */
const formatarMoeda = (valor) => {
  return valor.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  });
};

/**
 * Formata um número para porcentagem
 * Exemplo: 0.115 → "11,50%"
 */
const formatarPorcentagem = (valor) => {
  return (valor * 100).toFixed(2).replace('.', ',') + '%';
};

// === Funções para formatação do input de valor ===
/**
 * Formata o valor do input para permitir apenas números e um separador decimal.
 * Converte vírgula para ponto para facilitar o parseFloat.
 */
function formatInputAsNumber(input) {
    let value = input.value;
    // Remove tudo que não for dígito, vírgula ou ponto
    value = value.replace(/[^0-9.,]/g, '');
    // Permite apenas uma vírgula ou ponto como separador decimal
    const parts = value.split(/[.,]/);
    if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
    } else if (parts.length === 2 && value.includes(',')) {
        value = parts[0] + '.' + parts[1];
    }
    input.value = value;
}

/**
 * Formata o valor do input para o formato de moeda brasileira ao perder o foco.
 */
function formatInputAsCurrency(input) {
    let value = input.value.replace(/[R$\s.]/g, '').replace(',', '.'); // Limpa e converte para ponto decimal
    value = parseFloat(value);
    if (!isNaN(value)) {
        input.value = formatarMoeda(value);
    } else {
        input.value = ''; // Limpa o campo se não for um número válido
    }
}

// === DADOS GLOBAIS ===
let taxaSelicAtual = CONFIGURACOES.SELIC_PADRAO;

// === FUNÇÕES DE BUSCA DE DADOS ===
/**
 * Busca a taxa SELIC atual na API do Banco Central
 * Se não conseguir, usa a taxa padrão
 */
async function buscarTaxaSelic() {
  try {
    console.log('🔍 Buscando taxa SELIC atual...');
    
    const resposta = await fetch(CONFIGURACOES.API_SELIC);
    const dados = await resposta.json();
    
    // Converte a taxa de formato brasileiro (com vírgula) para decimal
    const taxaSelicAnual = parseFloat(dados[0].valor.replace(',', '.'));
    
    taxaSelicAtual = taxaSelicAnual;
    console.log(`✅ Taxa SELIC encontrada: ${taxaSelicAnual}% ao ano`);
    
  } catch (erro) {
    console.warn('⚠️ Erro ao buscar SELIC, usando taxa padrão:', erro);
    taxaSelicAtual = CONFIGURACOES.SELIC_PADRAO;
  }
}

// === CÁLCULOS FINANCEIROS ===

/**
 * Calcula a taxa de juros final com base no tipo de operação e nos fatores.
 * @param {string} tipoOperacao - 'direta' ou 'indireta'.
 * @param {number} custoFinanceiro - Custo Financeiro em porcentagem (ex: 7 para 7%).
 * @param {number} taxaBndes - Taxa do BNDES em porcentagem (ex: 1.5 para 1.5%).
 * @param {number} taxaAgente - Taxa do Agente Financeiro em porcentagem (ex: 3 para 3%).
 * @returns {number} Taxa de juros anual em formato decimal (ex: 0.1186).
 */
function calcularTaxaJurosFinal(tipoOperacao, custoFinanceiro, taxaBndes, taxaAgente) {
  const fatorCusto = 1 + (custoFinanceiro / 100);
  const fatorTaxaBndes = 1 + (taxaBndes / 100);
  
  let taxaJurosAnual;

  if (tipoOperacao === 'indireta') {
    const fatorTaxaAgente = 1 + (taxaAgente / 100);
    taxaJurosAnual = (fatorCusto * fatorTaxaBndes * fatorTaxaAgente) - 1;
  } else { // tipoOperacao === 'direta'
    taxaJurosAnual = (fatorCusto * fatorTaxaBndes) - 1;
  }
  return taxaJurosAnual;
}

/**
 * Controla a visibilidade do campo "Taxa do Agente Financeiro"
 * com base na seleção do tipo de operação.
 */
function toggleAgentRate() {
  const tipoOperacao = document.querySelector('input[name="tipoOperacao"]:checked').value;
  const agentRateGroup = document.getElementById('agentRateGroup');
  if (tipoOperacao === 'direta') {
    agentRateGroup.style.display = 'none';
    // Define um valor padrão para a taxa do agente quando não é aplicável
    document.getElementById('taxaAgente').value = '0'; 
  } else {
    agentRateGroup.style.display = 'block';
    // Opcional: restabelecer o valor padrão se o campo estava vazio antes de ser oculto
    if (document.getElementById('taxaAgente').value === '0') {
      document.getElementById('taxaAgente').value = '3'; 
    }
  }
}

/**
 * Alterna a visibilidade da seção de configurações avançadas.
 */
function toggleAdvancedSettings() {
  const advancedSettingsDiv = document.getElementById('advancedSettings');
  if (advancedSettingsDiv.style.display === 'none') {
    advancedSettingsDiv.style.display = 'block';
  } else {
    advancedSettingsDiv.style.display = 'none';
  }
}

/**
 * Calcula os juros compostos para investimentos
 * Fórmula: Montante = Capital × (1 + taxa)^tempo
 */
function calcularJurosCompostos(capital, taxaMensal, meses) {
  return capital * Math.pow(1 + taxaMensal, meses);
}

/**
 * Calcula a parcela mensal de um financiamento (Sistema Price)
 * Fórmula: Parcela = ValorFinanciado * [TaxaMensal / (1 - (1 + TaxaMensal)^-Meses)]
 */
function calcularParcelaMensal(valorFinanciado, taxaMensal, meses) {
  if (taxaMensal === 0) return valorFinanciado / meses;
  
  const numerador = valorFinanciado * taxaMensal;
  const denominador = 1 - Math.pow(1 + taxaMensal, -meses);
  return numerador / denominador;
}

/**
 * Calcula o IOF sobre crédito
 * 0,0041% ao dia nos primeiros 30 dias + 0,38% adicional
 */
function calcularIOF(valorOperacao, prazoMeses) {
  const prazoDias = prazoMeses * 30; // Aproximação de 30 dias por mês
  const diasIOF = Math.min(prazoDias, 365); // IOF diário limitado a 365 dias
  
  const iofDiario = valorOperacao * CONFIGURACOES.IOF_TAXA_DIARIA * diasIOF;
  const iofAdicional = valorOperacao * CONFIGURACOES.IOF_ADICIONAL; 
  
  return iofDiario + iofAdicional;
}

/**
 * Calcula o seguro da operação
 * Fórmula: valor da operação * 0,066% * o prazo
 */
function calcularSeguro(valorOperacao, prazoMeses) {
  // O seguro é 0.066% do valor da operação, multiplicado pelo prazo em meses
  return valorOperacao * CONFIGURACOES.SEGURO_TAXA_PROPORCIONAL * prazoMeses;
}

/**
 * Calcula o CET (Custo Efetivo Total)
 * Inclui juros, IOF e seguros.
 * Retorna o custo total e o CET anual aproximado.
 */
function calcularCET(valorFinanciado, parcelaMensal, meses, iof, seguro) {
  const totalParcelas = parcelaMensal * meses;
  const valorTotalPago = totalParcelas + iof + seguro;
  const custoTotal = valorTotalPago - valorFinanciado; // Custo além do valor financiado

  // Para calcular o CET anual aproximado (taxa equivalente)
  // Usamos a taxa interna de retorno (TIR) ou uma aproximação.
  // A fórmula abaixo é uma aproximação para a taxa efetiva anual.
  // CET anual = ((Total Pago / Valor Financiado) ^ (12/meses)) - 1
  // Nota: Para um CET exato, seria necessário um cálculo iterativo (TIR).
  const fatorCET = valorTotalPago / valorFinanciado;
  const cetAnual = Math.pow(fatorCET, 12 / meses) - 1;
  
  return {
    custoTotal,
    cetAnual,
    valorTotalPago,
    totalJuros: totalParcelas - valorFinanciado // Juros pagos nas parcelas
  };
}

/**
 * Calcula a remuneração do capital social
 * Remuneração = Capital Social × (Taxa SELIC Anual / 100) × (prazo em anos)
 * A SELIC é uma taxa anual, e a remuneração é proporcional ao tempo.
 */
function calcularRemuneracaoCapitalSocial(capitalSocial, taxaSelicAnual, prazoMeses) {
  const prazoAnos = prazoMeses / 12;
  // Convertendo taxaSelicAnual de % para decimal (ex: 10.5% -> 0.105)
  const remuneracao = capitalSocial * (taxaSelicAnual / 100) * prazoAnos;
  return remuneracao;
}

/**
 * Gera o plano de amortização (tabela Price)
 */
function gerarPlanoAmortizacao(valorFinanciado, taxaMensal, meses, parcelaMensal) {
  let saldoDevedor = valorFinanciado;
  const plano = [];

  for (let i = 1; i <= meses; i++) {
    const jurosParcela = saldoDevedor * taxaMensal;
    const amortizacao = parcelaMensal - jurosParcela;
    saldoDevedor -= amortizacao;

    plano.push({
      parcela: i,
      valorParcela: parcelaMensal,
      juros: jurosParcela,
      amortizacao: amortizacao,
      saldoDevedor: saldoDevedor > 0.01 ? saldoDevedor : 0 // Evita valores negativos por imprecisão de ponto flutuante
    });
  }
  return plano;
}

// === FUNÇÃO PRINCIPAL DE SIMULAÇÃO ===
async function calcularSimulacao() {
  // === 1. VALIDAR DADOS DE ENTRADA ===
  // Obter o valor do input e remover a formatação de moeda para cálculo
  const valorInput = document.getElementById("valor").value;
  const valorFinanciado = parseFloat(valorInput.replace(/[R$\s.]/g, '').replace(',', '.'));
  
  const mesesFinanciamento = parseInt(document.getElementById("meses").value);

  // Obter parâmetros para o cálculo da taxa de juros (mesmo se ocultos, terão seus valores padrão)
  const tipoOperacao = document.querySelector('input[name="tipoOperacao"]:checked').value;
  const custoFinanceiro = parseFloat(document.getElementById("custoFinanceiro").value);
  const taxaBndes = parseFloat(document.getElementById("taxaBndes").value);
  const taxaAgente = parseFloat(document.getElementById("taxaAgente").value); // Já tratada para ser 0 se direta em toggleAgentRate()

  if (isNaN(valorFinanciado) || isNaN(mesesFinanciamento) || valorFinanciado <= 0 || mesesFinanciamento <= 0 ||
      isNaN(custoFinanceiro) || isNaN(taxaBndes) || isNaN(taxaAgente)) {
    // Usando um modal simples em vez de alert para melhor UX
    mostrarMensagem('⚠️ Por favor, preencha todos os campos com valores válidos para simulação e parâmetros de taxa!', 'warning');
    return;
  }

  // === 2. BUSCAR TAXA SELIC ATUAL ===
  await buscarTaxaSelic();

  // === 3. CALCULAR TAXA DE JUROS ANUAL DINÂMICA ===
  const taxaProcapcredAnual = calcularTaxaJurosFinal(tipoOperacao, custoFinanceiro, taxaBndes, taxaAgente);
  // Converter taxa anual do Procapcred para mensal (taxa equivalente)
  const taxaProcapcredMensal = Math.pow(1 + taxaProcapcredAnual, 1/12) - 1;
  
  // === 4. CALCULAR PARCELAS E CUSTOS ===
  const parcelaMensal = calcularParcelaMensal(valorFinanciado, taxaProcapcredMensal, mesesFinanciamento);
  const totalParcelasPagas = parcelaMensal * mesesFinanciamento;
  
  // Calcular IOF e Seguro
  const iof = calcularIOF(valorFinanciado, mesesFinanciamento);
  const seguro = calcularSeguro(valorFinanciado, mesesFinanciamento);
  
  // Calcular CET
  const dadosCET = calcularCET(valorFinanciado, parcelaMensal, mesesFinanciamento, iof, seguro);

  // === 5. CALCULAR REMUNERAÇÃO DO CAPITAL SOCIAL ===
  // Assumindo que o capital social é igual ao valor financiado para a simulação
  const capitalSocial = valorFinanciado; 
  const remuneracaoCapitalSocial = calcularRemuneracaoCapitalSocial(capitalSocial, taxaSelicAtual, mesesFinanciamento);

  // === 6. CALCULAR INVESTIMENTO ALTERNATIVO (POUPANÇA) ===
  const montantePoupanca = calcularJurosCompostos(valorFinanciado, CONFIGURACOES.TAXA_POUPANCA_MENSAL, mesesFinanciamento);
  const rendimentoPoupanca = montantePoupanca - valorFinanciado;

  // === 7. CALCULAR RESULTADO LÍQUIDO ===
  // Remuneração do capital social menos o custo total do empréstimo (juros + IOF + seguros)
  const resultadoLiquido = remuneracaoCapitalSocial - dadosCET.custoTotal;

  // === 8. GERAR PLANO DE AMORTIZAÇÃO ===
  const planoAmortizacao = gerarPlanoAmortizacao(valorFinanciado, taxaProcapcredMensal, mesesFinanciamento, parcelaMensal);

  // === 9. EXIBIR RESULTADOS ===
  exibirResultados({ 
    valorFinanciado,
    mesesFinanciamento,
    taxaSelicAtual,
    parcelaMensal,
    totalParcelasPagas,
    jurosTotais: dadosCET.totalJuros, // Juros apenas das parcelas
    iof,
    seguro,
    remuneracaoCapitalSocial,
    rendimentoPoupanca,
    resultadoLiquido,
    cetAnual: dadosCET.cetAnual,
    custoTotal: dadosCET.custoTotal, // Custo total (juros + IOF + seguros)
    valorTotalPago: dadosCET.valorTotalPago, // Valor total pago pelo cliente
    planoAmortizacao
  });
}

// === EXIBIÇÃO DE RESULTADOS ===
function exibirResultados(dados) { 
  // Mostrar a seção de resultados
  document.getElementById("resultados").style.display = "block";
  
  // Rolar suavemente até os resultados
  document.getElementById("resultados").scrollIntoView({ 
    behavior: 'smooth' 
  });

  // === RESULTADO PRINCIPAL ===
  const resultadoPrincipal = document.getElementById("resultado-principal");
  const iconeResultado = document.getElementById("resultado-icon");
  const tituloResultado = document.getElementById("resultado-titulo");
  const valorResultado = document.getElementById("resultado-valor");
  const descricaoResultado = document.getElementById("resultado-descricao");

  let descricaoAdicional = `Este valor de rentabilidade é referente ao período de ${dados.mesesFinanciamento} meses e acompanha a taxa SELIC atual (${dados.taxaSelicAtual.toFixed(2).replace('.', ',')}% a.a.) do dia da simulação. Os resultados podem sofrer alterações conforme a volatilidade da SELIC.`;


  if (dados.resultadoLiquido > 0) {
    // É vantajoso fazer o empréstimo
    iconeResultado.textContent = "🎉";
    tituloResultado.textContent = "Excelente Negócio!";
    valorResultado.textContent = `+${formatarMoeda(dados.resultadoLiquido)}`;
    descricaoResultado.innerHTML = `Você terá lucro líquido investindo no capital social! <br>${descricaoAdicional}`;
    resultadoPrincipal.style.background = "linear-gradient(135deg, #48bb78 0%, #38a169 100%)";
  } else if (dados.resultadoLiquido >= -50) { // Ajustado para uma margem menor de "equilíbrio"
    // Resultado neutro (pequena perda)
    iconeResultado.textContent = "⚖️";
    tituloResultado.textContent = "Resultado Equilibrado";
    valorResultado.textContent = formatarMoeda(dados.resultadoLiquido);
    descricaoResultado.innerHTML = `O investimento quase cobre os custos do empréstimo. Considere os benefícios intangíveis. <br>${descricaoAdicional}`;
    resultadoPrincipal.style.background = "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)";
  } else {
    // Não é vantajoso
    iconeResultado.textContent = "⚠️";
    tituloResultado.textContent = "Atenção!";
    valorResultado.textContent = formatarMoeda(dados.resultadoLiquido);
    descricaoResultado.innerHTML = `A remuneração não cobrirá totalmente os custos do empréstimo. Analise com cautela. <br>${descricaoAdicional}`;
    resultadoPrincipal.style.background = "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)";
  }

  // === COMPARATIVO ===
  exibirComparativo(dados);
  exibirResumoComparativo(dados); // Nova função para o resumo textual

  // === GRÁFICO ===
  exibirGrafico(dados);
  exibirGraficoAmortizacao(dados.planoAmortizacao); // Exibir novo gráfico de amortização

  // === PARCELAS ===
  exibirParcelas(dados.planoAmortizacao);

  // === CONFIGURAR BOTÕES DE PARTILHA ===
  configurarBotoesPartilha(dados);
}

function exibirComparativo(dados) {
  const comparativoDiv = document.getElementById("comparativo");
  
  comparativoDiv.innerHTML = `
    <div class="comparison-card ${dados.custoTotal > dados.remuneracaoCapitalSocial ? 'loser' : ''}" title="O custo total do seu empréstimo, incluindo juros, IOF e seguros.">
      <div class="comparison-icon">💸</div>
      <div class="comparison-title">Custo Total do Empréstimo</div>
      <div class="comparison-value">${formatarMoeda(dados.custoTotal)}</div>
      <div>Juros + IOF + Seguros</div>
    </div>

    <div class="comparison-card ${dados.remuneracaoCapitalSocial > dados.custoTotal ? 'winner' : ''}" title="A remuneração estimada do seu capital social, baseada em 100% da SELIC no período de ${dados.mesesFinanciamento} meses.">
      <div class="comparison-icon">💰</div>
      <div class="comparison-title">Remuneração do Capital Social</div>
      <div class="comparison-value">${formatarMoeda(dados.remuneracaoCapitalSocial)}</div>
      <div>100% da SELIC no período</div>
    </div>

    <div class="comparison-card" title="O rendimento que o valor financiado geraria se fosse investido na poupança durante ${dados.mesesFinanciamento} meses.">
      <div class="comparison-icon">🏦</div>
      <div class="comparison-title">Rendimento Potencial na Poupança</div>
      <div class="comparison-value">${formatarMoeda(dados.rendimentoPoupanca)}</div>
      <div>Se o valor fosse investido</div>
    </div>

    <div class="comparison-card" title="O Custo Efetivo Total anual do seu crédito, incluindo todos os encargos e despesas.">
      <div class="comparison-icon">📊</div>
      <div class="comparison-title">CET (Custo Efetivo Total) Anual</div>
      <div class="comparison-value">${formatarPorcentagem(dados.cetAnual)}</div>
      <div>Custo total anual do crédito</div>
    </div>
  `;
}

/**
 * Exibe um resumo textual da comparação entre a remuneração do capital social,
 * o custo do empréstimo e o rendimento da poupança.
 */
function exibirResumoComparativo(dados) {
    const summaryDiv = document.getElementById("summary-comparison");
    let message = "";
    let typeClass = "";

    // Informação sobre o prazo e SELIC com a adição sobre a volatilidade
    const infoPrazoSelic = `A rentabilidade do capital social é calculada para o prazo de ${dados.mesesFinanciamento} meses e acompanha a taxa SELIC atual (${dados.taxaSelicAtual.toFixed(2).replace('.', ',')}% a.a.) do dia da simulação. Os resultados podem sofrer alterações conforme a volatilidade da SELIC.`;
    
    // Nova explicação sobre CET vs. Taxa Nominal
    const infoCetNominal = `O Custo Efetivo Total (CET) reflete o custo real do seu empréstimo, incluindo juros, IOF e seguros. Devido à forma como o IOF e os seguros são calculados (com parcelas fixas ou proporcionais ao prazo, mas não sempre exponencialmente como os juros), o CET pode ser diferente da taxa nominal anual do empréstimo, e por vezes até inferior em prazos mais longos. O CET é a taxa que realmente importa para comparar o custo total do crédito.`;


    if (dados.resultadoLiquido > 0) {
        message = `🎉 **Excelente!** O investimento no capital social pode gerar um lucro líquido de ${formatarMoeda(dados.resultadoLiquido)} ao final do período, superando os custos do seu empréstimo. ${infoPrazoSelic} ${infoCetNominal}`;
        typeClass = "positive";
    } else if (dados.resultadoLiquido >= -50) {
        message = `⚖️ **Equilibrado.** O custo do seu empréstimo e a remuneração do capital social são muito próximos, resultando numa diferença de ${formatarMoeda(dados.resultadoLiquido)}. Considere os benefícios não financeiros. ${infoPrazoSelic} ${infoCetNominal}`;
        typeClass = "neutral";
    } else {
        message = `⚠️ **Atenção!** O custo total do seu empréstimo é superior à remuneração do capital social, resultando numa perda de ${formatarMoeda(dados.resultadoLiquido)}. Avalie bem esta opção. ${infoPrazoSelic} ${infoCetNominal}`;
        typeClass = "negative";
    }

    summaryDiv.innerHTML = message;
    summaryDiv.className = `summary-section ${typeClass}`;
}


function exibirGrafico(dados) {
  const graficoContainer = document.getElementById("grafico-container");
  const canvas = document.getElementById("grafico");
  
  graficoContainer.style.display = "block";

  // Destruir gráfico anterior se existir
  if (window.meuGrafico) {
    window.meuGrafico.destroy();
  }

  // Criar novo gráfico
  window.meuGrafico = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['💸 Custo Total', '💰 Remuneração Capital', '🏦 Rend. Poupança'],
      datasets: [{
        label: 'Valores em R$',
        data: [dados.custoTotal, dados.remuneracaoCapitalSocial, dados.rendimentoPoupanca],
        backgroundColor: [
          'rgba(245, 101, 101, 0.8)',  // Vermelho para custos
          'rgba(72, 187, 120, 0.8)',   // Verde para remuneração
          'rgba(33, 150, 243, 0.8)'    // Azul para poupança
        ],
        borderColor: [
          'rgb(245, 101, 101)',
          'rgb(72, 187, 120)',
          'rgb(33, 150, 243)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { 
          display: false 
        },
        tooltip: { 
          callbacks: { 
            label: function(context) {
              return formatarMoeda(context.raw);
            }
          }
        }
      },
      scales: {
        y: { 
          beginAtZero: true,
          ticks: { 
            callback: function(value) {
              return formatarMoeda(value);
            }
          }
        }
      }
    }
  });
}

/**
 * Exibe um gráfico de linha para o plano de amortização, mostrando juros, amortização e saldo devedor.
 */
function exibirGraficoAmortizacao(planoAmortizacao) {
    const amortizacaoChartContainer = document.getElementById("amortizacao-chart-container");
    const canvas = document.getElementById("grafico-amortizacao");
    
    amortizacaoChartContainer.style.display = "block";

    // Destruir gráfico anterior se existir
    if (window.meuGraficoAmortizacao) {
        window.meuGraficoAmortizacao.destroy();
    }

    const labels = planoAmortizacao.map(item => `Mês ${item.parcela}`);
    const jurosData = planoAmortizacao.map(item => item.juros);
    const amortizacaoData = planoAmortizacao.map(item => item.amortizacao);
    const saldoDevedorData = planoAmortizacao.map(item => item.saldoDevedor);

    window.meuGraficoAmortizacao = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Juros',
                    data: jurosData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Amortização',
                    data: amortizacaoData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Saldo Devedor',
                    data: saldoDevedorData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false, /* Não preencher abaixo da linha para saldo devedor */
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatarMoeda(context.raw)}`;
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Mês'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Valor (R$)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatarMoeda(value);
                            }
                        }
                    }
                }
            }
        }
    });
}

function exibirParcelas(planoAmortizacao) {
  const parcelasGrid = document.getElementById("parcelas-grid");
  parcelasGrid.innerHTML = ''; // Limpa o conteúdo anterior

  planoAmortizacao.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Parcela">${item.parcela}</td>
      <td data-label="Valor da Parcela">${formatarMoeda(item.valorParcela)}</td>
      <td data-label="Juros">${formatarMoeda(item.juros)}</td>
      <td data-label="Amortização">${formatarMoeda(item.amortizacao)}</td>
      <td data-label="Saldo Devedor">${formatarMoeda(item.saldoDevedor)}</td>
    `;
    parcelasGrid.appendChild(row);
  });
}

/**
 * Configura os botões de partilha com os dados da simulação.
 */
function configurarBotoesPartilha(dados) {
    const shareWhatsappBtn = document.getElementById('share-whatsapp');
    const shareEmailBtn = document.getElementById('share-email');

    const message = `Simulação Procapcred:\n\n` +
                    `Valor Financiado: ${formatarMoeda(dados.valorFinanciado)}\n` +
                    `Prazo: ${dados.mesesFinanciamento} meses\n` +
                    `Custo Total do Empréstimo: ${formatarMoeda(dados.custoTotal)}\n` +
                    `Remuneração do Capital Social: ${formatarMoeda(dados.remuneracaoCapitalSocial)}\n` +
                    `Resultado Líquido: ${formatarMoeda(dados.resultadoLiquido)}\n` +
                    `CET Anual: ${formatarPorcentagem(dados.cetAnual)}\n\n` +
                    `Lembre-se: A rentabilidade do capital social acompanha a SELIC atual (${dados.taxaSelicAtual.toFixed(2).replace('.', ',')}% a.a.) do dia da simulação. Os resultados podem sofrer alterações conforme a volatilidade da SELIC.`;

    // WhatsApp
    shareWhatsappBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    // Email
    const subject = encodeURIComponent('Simulação Procapcred - Seus Resultados');
    const body = encodeURIComponent(message);
    document.getElementById('share-email').onclick = function() {
        window.open(`mailto:?subject=${subject}&body=${body}`);
        return false; // Previne a navegação padrão do link
    };
}

// Função para exibir mensagens (substitui alert)
function mostrarMensagem(mensagem, tipo = 'info') {
  // Cria um elemento de mensagem simples no topo da página
  let messageBox = document.getElementById('message-box');
  if (!messageBox) {
    messageBox = document.createElement('div');
    messageBox.id = 'message-box';
    Object.assign(messageBox.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '15px 25px',
      borderRadius: '10px',
      boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
      zIndex: '1000',
      fontSize: '1.1em',
      fontWeight: 'bold',
      color: 'white',
      textAlign: 'center',
      opacity: '0',
      transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out'
    });
    document.body.appendChild(messageBox);
  }

  messageBox.textContent = mensagem;
  if (tipo === 'warning') {
    messageBox.style.backgroundColor = '#f0ad4e'; // Laranja
  } else if (tipo === 'success') {
    messageBox.style.backgroundColor = '#5cb85c'; // Verde
  } else {
    messageBox.style.backgroundColor = '#5bc0de'; // Azul
  }

  messageBox.style.opacity = '1';
  messageBox.style.transform = 'translateX(-50%) translateY(0)';

  setTimeout(() => {
    messageBox.style.opacity = '0';
    messageBox.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => messageBox.remove(), 500); // Remove após a transição
  }, 3000);
}

// Inicializa a busca pela SELIC ao carregar a página e ajusta a visibilidade
document.addEventListener('DOMContentLoaded', () => {
  buscarTaxaSelic();
  toggleAgentRate(); // Garante o estado correto ao carregar a página
});