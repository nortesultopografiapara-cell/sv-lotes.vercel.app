/**
 * Formatação pt-BR para memorial descritivo.
 */

export function displayOrNotInformed(value: unknown): string {
  const t = String(value ?? '').trim();
  return t || 'Não informado';
}

export function formatMemorialCoord(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} m`;
}

export function formatMemorialDistanceM(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

export function formatMemorialAreaM2(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;
}

export function memorialVertexLabel(vertexOrder: number): string {
  return `M-${String(vertexOrder + 1).padStart(2, '0')}`;
}
