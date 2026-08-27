/**
 * Flexão dos rótulos das partes — exclusivo do modelo MUNDO_NOVO.
 * Não infere gênero por nome. Não altera ARAGUAIA nem demais modelos.
 */

export type MundoNovoInflectionGender = 'm' | 'f' | 'unknown';

export type MundoNovoPartyGenderSignals = {
  maritalStatus?: string | null;
  nationality?: string | null;
};

export type MundoNovoPartyRole = 'buyer' | 'vendor';

export type MundoNovoPartyInflection = {
  count: number;
  gender: 'm' | 'f';
  genderKnownForAll: boolean;
  unknownCount: number;
  label: string;
  art: string;
  Art: string;
  ao: string;
  of: string;
  pelo: string;
  the: string;
  The: string;
  to: string;
  by: string;
  ofPhrase: string;
  inFavor: string;
  denominado: string;
  represented: string;
  declara: string;
  autoriza: string;
  devera: string;
  obriga: string;
  arcara: string;
  visitou: string;
  ficam: string;
  promete: string;
  afirma: string;
  limitations: string[];
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function key(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNeutralized(raw: string): boolean {
  return /\(\s*a\s*\)/i.test(raw);
}

export function resolveMundoNovoGrammaticalGender(
  signals: MundoNovoPartyGenderSignals,
): MundoNovoInflectionGender {
  const maritalRaw = clean(signals.maritalStatus);
  if (maritalRaw && !isNeutralized(maritalRaw)) {
    const m = key(maritalRaw).replace(/\(a\)/g, '');
    if (/^(solteira|casada|divorciada|viuva)s?$/.test(m)) return 'f';
    if (/^(solteiro|casado|divorciado|viuvo)s?$/.test(m)) return 'm';
  }
  const natRaw = clean(signals.nationality);
  if (natRaw && !isNeutralized(natRaw)) {
    const n = key(natRaw).replace(/\(a\)/g, '');
    if (/^brasileiras?$/.test(n)) return 'f';
    if (/^brasileiros?$/.test(n)) return 'm';
  }
  return 'unknown';
}

function roleNoun(role: MundoNovoPartyRole, plural: boolean, gender: 'm' | 'f'): string {
  if (role === 'buyer') {
    if (!plural) return gender === 'f' ? 'COMPRADORA' : 'COMPRADOR';
    return gender === 'f' ? 'COMPRADORAS' : 'COMPRADORES';
  }
  if (!plural) return gender === 'f' ? 'VENDEDORA' : 'VENDEDOR';
  return gender === 'f' ? 'VENDEDORAS' : 'VENDEDORES';
}

function articles(plural: boolean, gender: 'm' | 'f') {
  if (!plural && gender === 'f') {
    return { art: 'a', Art: 'A', ao: 'à', of: 'da', pelo: 'pela' };
  }
  if (!plural) {
    return { art: 'o', Art: 'O', ao: 'ao', of: 'do', pelo: 'pelo' };
  }
  if (gender === 'f') {
    return { art: 'as', Art: 'As', ao: 'às', of: 'das', pelo: 'pelas' };
  }
  return { art: 'os', Art: 'Os', ao: 'aos', of: 'dos', pelo: 'pelos' };
}

export function inflectMundoNovoContractParties(
  parties: MundoNovoPartyGenderSignals[],
  role: MundoNovoPartyRole,
): MundoNovoPartyInflection {
  const list = parties.length > 0 ? parties : [{}];
  const count = parties.length;
  const genders = list.map((p) => resolveMundoNovoGrammaticalGender(p));
  const unknownCount = genders.filter((g) => g === 'unknown').length;
  const known = genders.filter((g): g is 'm' | 'f' => g !== 'unknown');
  const n = count === 0 ? 1 : count;
  const plural = n !== 1;
  const genderKnownForAll = count > 0 && unknownCount === 0;
  const allKnownFeminine =
    genderKnownForAll && known.length > 0 && known.every((g) => g === 'f');
  const gender: 'm' | 'f' = allKnownFeminine ? 'f' : 'm';
  const label = `${plural ? 'PROMITENTES' : 'PROMITENTE'} ${roleNoun(role, plural, gender)}`;
  const a = articles(plural, gender);
  const limitations: string[] = [];
  if (unknownCount > 0) {
    limitations.push(
      count === 1
        ? `${role}: sem estado civil/nacionalidade brasileira brutos; usada forma masculina não marcada.`
        : `${role}: ${unknownCount} parte(s) sem gênero estruturado; plural masculino não marcado.`,
    );
  }
  const the = `${a.art} ${label}`;
  const The = `${a.Art} ${label}`;
  return {
    count,
    gender,
    genderKnownForAll,
    unknownCount,
    label,
    art: a.art,
    Art: a.Art,
    ao: a.ao,
    of: a.of,
    pelo: a.pelo,
    the,
    The,
    to: `${a.ao} ${label}`,
    by: `${a.pelo} ${label}`,
    ofPhrase: `${a.of} ${label}`,
    inFavor: `em favor ${a.of} ${label}`,
    denominado: !plural
      ? gender === 'f'
        ? 'denominada'
        : 'denominado'
      : gender === 'f'
        ? 'denominadas'
        : 'denominados',
    represented: !plural
      ? gender === 'f'
        ? 'representada'
        : 'representado'
      : gender === 'f'
        ? 'representadas'
        : 'representados',
    declara: plural ? 'declaram' : 'declara',
    autoriza: plural ? 'autorizam' : 'autoriza',
    devera: plural ? 'deverão' : 'deverá',
    obriga: plural ? 'obrigam' : 'obriga',
    arcara: plural ? 'arcarão' : 'arcará',
    visitou: plural ? 'visitaram' : 'visitou',
    ficam: plural ? 'ficam' : 'fica',
    promete: plural ? 'prometem' : 'promete',
    afirma: plural ? 'afirmam' : 'afirma',
    limitations,
  };
}

export function inflectMundoNovoSingleParty(
  signals: MundoNovoPartyGenderSignals,
  role: MundoNovoPartyRole,
): MundoNovoPartyInflection {
  return inflectMundoNovoContractParties([signals], role);
}
