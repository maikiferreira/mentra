import { MEEM_DOMAINS, type MeemDomainKey } from './index.js';

export type MeemScores = Record<MeemDomainKey, number>;

export interface Evaluation {
  date: string;
  scores: MeemScores;
}

export interface DomainFlag {
  domain: (typeof MEEM_DOMAINS)[number];
  peak: number;
  peakDate: string;
  last: number;
  lastDate: string;
  fell: boolean;
  below: boolean;
  score: number;
}

export interface Activity {
  title: string;
  text: string;
  duration: string;
  frequency: string;
}

export interface Suggestion {
  key: string;
  domain: MeemDomainKey | 'base' | 'keep';
  activity: Activity;
  why: string;
  sources: string[];
  fell: boolean;
  lastDate: string | null;
}

export const ACTIVITY_LIBRARY: Record<MeemDomainKey, Activity> = {
  ori: {
    title: 'Ritual de orientação no início da sessão',
    text: 'Abrir a sessão com calendário, clima e rotina do dia, pedindo que a pessoa complete sozinha antes de receber a correção.',
    duration: '5 min',
    frequency: 'a cada sessão',
  },
  reg: {
    title: 'Repetição de palavras encadeadas',
    text: 'Dizer três palavras do dia a dia e pedir a repetição imediata, aumentando uma palavra a cada acerto.',
    duration: '8 min',
    frequency: '2x por semana',
  },
  ate: {
    title: 'Atenção sustentada: cancelamento de figuras',
    text: 'Riscar uma figura-alvo numa folha com figuras variadas, em tempo marcado, aumentando a densidade a cada semana.',
    duration: '10 min',
    frequency: '3x por semana',
  },
  evo: {
    title: 'Evocação tardia com histórias de vida',
    text: 'Contar uma história curta ligada à vida da pessoa e pedir que reconte 10 minutos depois, com pistas de categoria.',
    duration: '15 min',
    frequency: '2x por semana',
  },
  lin: {
    title: 'Fluência verbal por categorias',
    text: 'Pedir o maior número de itens de uma categoria em um minuto (frutas, ferramentas, cidades), variando a categoria.',
    duration: '10 min',
    frequency: '2x por semana',
  },
};

export const KEEP_ACTIVITY: Activity = {
  title: 'Manter e desafiar',
  text: 'Aumentar a complexidade das atividades atuais, por exemplo mais cartas no jogo de pares, e registrar o tempo de execução.',
  duration: '15 min',
  frequency: '2x por semana',
};

export const BASELINE_ACTIVITY: Activity = {
  title: 'Linha de base: atividades de dificuldade média',
  text: 'Começar com uma atividade de dificuldade média em cada domínio e registrar o tempo e o apoio necessários, para ter parâmetros nas próximas avaliações.',
  duration: '15 min',
  frequency: '2x por semana',
};

export function totalScore(scores: MeemScores): number {
  return MEEM_DOMAINS.reduce((sum, domain) => sum + scores[domain.key], 0);
}

export function calculateTrend(evaluations: Evaluation[]): {
  kind: 'none' | 'first' | 'up' | 'down' | 'stable';
  label: string;
  delta: number | null;
} {
  if (evaluations.length === 0) return { kind: 'none', label: 'sem avaliações', delta: null };
  if (evaluations.length === 1) return { kind: 'first', label: 'primeira avaliação', delta: null };

  const last = totalScore(evaluations[evaluations.length - 1]!.scores);
  const previous = totalScore(evaluations[evaluations.length - 2]!.scores);
  const delta = last - previous;
  if (delta > 0) return { kind: 'up', label: `▲ subiu ${delta}`, delta };
  if (delta < 0) return { kind: 'down', label: `▼ caiu ${Math.abs(delta)}`, delta };
  return { kind: 'stable', label: '● estável', delta };
}

export function calculateDomainFlags(evaluations: Evaluation[]): DomainFlag[] {
  if (evaluations.length < 2) return [];
  const previous = evaluations[evaluations.length - 2]!;
  const last = evaluations[evaluations.length - 1]!;

  return MEEM_DOMAINS.map((domain) => {
    const peak = Math.max(...evaluations.map((evaluation) => evaluation.scores[domain.key]!));
    const peakEvaluation = evaluations.find(
      (evaluation) => evaluation.scores[domain.key] === peak,
    )!;
    const lastValue = last.scores[domain.key]!;
    return {
      domain,
      peak,
      peakDate: peakEvaluation.date,
      last: lastValue,
      lastDate: last.date,
      fell: lastValue < previous.scores[domain.key]!,
      below: lastValue < peak,
      score: (peak - lastValue) / domain.max,
    };
  })
    .filter((flag) => flag.below)
    .sort((left, right) => Number(right.fell) - Number(left.fell) || right.score - left.score)
    .slice(0, 3);
}

export function generateSuggestions(patient: {
  id: string;
  evaluations: Evaluation[];
}): Suggestion[] {
  const { id, evaluations } = patient;
  if (evaluations.length === 0) return [];
  if (evaluations.length === 1) {
    const first = evaluations[0]!;
    return [
      {
        key: `${id}:base`,
        domain: 'base',
        activity: BASELINE_ACTIVITY,
        why: `Primeira avaliação registrada em ${first.date}. A comparação com avaliações anteriores começa na próxima ficha.`,
        sources: [first.date],
        fell: false,
        lastDate: null,
      },
    ];
  }

  const flags = calculateDomainFlags(evaluations);
  if (flags.length === 0) {
    const first = evaluations[0]!;
    const last = evaluations[evaluations.length - 1]!;
    return [
      {
        key: `${id}:keep`,
        domain: 'keep',
        activity: KEEP_ACTIVITY,
        why: `Nenhum domínio ficou abaixo do melhor resultado registrado. O total passou de ${totalScore(first.scores)} em ${first.date} para ${totalScore(last.scores)} em ${last.date}.`,
        sources: [first.date, last.date],
        fell: false,
        lastDate: null,
      },
    ];
  }

  return flags.map((flag) => ({
    key: `${id}:${flag.domain.key}`,
    domain: flag.domain.key,
    activity: ACTIVITY_LIBRARY[flag.domain.key]!,
    why: `${flag.domain.name}: melhor resultado ${flag.peak}/${flag.domain.max} em ${flag.peakDate}, agora ${flag.last}/${flag.domain.max} em ${flag.lastDate}${flag.fell ? ' (caiu desde a avaliação anterior).' : ' (segue abaixo do melhor resultado).'}`,
    sources: [flag.peakDate, flag.lastDate],
    fell: flag.fell,
    lastDate: flag.lastDate,
  }));
}

export function nextPatientCode(existingCodes: string[]): string {
  const highest = existingCodes.reduce(
    (max, code) => Math.max(max, Number.parseInt(code, 10) || 0),
    0,
  );
  return String(highest + 1).padStart(3, '0');
}

export function firstNameUsername(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] ?? '';
  const username = firstName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  return username || 'usuario';
}

export function uniqueUsername(base: string, existingUsernames: string[]): string {
  if (!existingUsernames.includes(base)) return base;
  let suffix = 2;
  while (existingUsernames.includes(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}
