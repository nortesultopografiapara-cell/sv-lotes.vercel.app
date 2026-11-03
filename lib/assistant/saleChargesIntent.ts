function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function looksLikeGlobalChargeQuestion(question: string, pathname?: string | null): boolean {
  const n = normalize(question);
  const path = String(pathname || '');
  if (path === '/charges' || path.startsWith('/charges/')) {
    if (/desta venda|dessa venda|editar venda|faltantes/.test(n)) return false;
    return true;
  }
  return /varias vendas|em massa|central operacional|modulo cobrancas|menu lateral/.test(n);
}

export function looksLikeSaleChargeQuestion(question: string, pathname?: string | null): boolean {
  const n = normalize(question);
  if (looksLikeGlobalChargeQuestion(question, pathname)) return false;
  return (
    /desta venda|dessa venda|nesta tela|nessa tela|editar venda|aba cobrancas|faltantes|atualizar situacao/.test(n) ||
    (/gerar.{0,24}(boleto|cobranc)/.test(n) && /(venda|lote|tela|falt)/.test(n)) ||
    /boletos? desta venda/.test(n) ||
    /cobrancas? (desta|dessa) venda/.test(n) ||
    /mais facil.{0,40}(tela|cobranc|boleto)/.test(n) ||
    /(tela).{0,40}(gerar|boleto|cobranc)/.test(n)
  );
}

export function looksLikeChargeFollowUp(question: string): boolean {
  const n = normalize(question).trim();
  return /ja gerei|ja cliquei em gerar|o que faco agora|e agora|proximo passo|atualizar situacao/.test(n);
}
