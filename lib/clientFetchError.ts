/**
 * Mensagens amigáveis para falhas de rede/API no cliente.
 */

export function formatClientFetchError(options: {
  status?: number;
  apiError?: string | null;
  networkMessage?: string;
  timeout?: boolean;
}): string {
  const { status = 0, apiError, networkMessage, timeout } = options;
  const trimmedApi = String(apiError || '').trim();
  if (trimmedApi) return trimmedApi;

  if (timeout) {
    return 'O servidor demorou para responder. Tente novamente.';
  }

  const net = String(networkMessage || '').toLowerCase();
  if (
    net.includes('abort') ||
    net.includes('tempo esgotado') ||
    net.includes('timed out')
  ) {
    return 'O servidor demorou para responder. Tente novamente.';
  }
  if (net.includes('failed to fetch') || net.includes('networkerror')) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }

  if (status === 401) return 'Sessão expirada. Faça login novamente.';
  if (status === 403) return 'Sem permissão para esta ação.';
  if (status >= 500) {
    return 'Falha temporária no banco de dados. Tente novamente em alguns instantes.';
  }
  if (status > 0) {
    return `Não foi possível carregar os dados (HTTP ${status}). Tente novamente.`;
  }

  return 'Não foi possível carregar os dados. Tente novamente.';
}
