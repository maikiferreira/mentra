// Catálogo dos testes de rastreio (fonte: e-book "Teste de rastreio cognitivo em idosos").
// Cada teste define os campos da ficha, a pontuação, a interpretação pelas notas de corte
// do e-book e as sugestões de rotina derivadas do resultado.
// Atenção: este módulo não pode ler constantes de `index.ts` no carregamento (import circular).
import {
  KEEP_ACTIVITY,
  generateSuggestions,
  type Activity,
  type MeemScores,
  type Suggestion,
} from './care-planning.js';

export type InstrumentKey =
  'meem' | 'moca' | 'relogio' | 'fluencia' | 'gds' | 'gai' | 'pfeffer' | 'katz' | 'cdr';
export type InstrumentCategory = 'cognicao' | 'humor' | 'funcionalidade';
export type ResultLevel = 'ok' | 'attention' | 'alert' | 'info';
export type InstrumentScores = Record<string, number>;

export interface FieldOption {
  value: number;
  label: string;
  description?: string;
}

export interface InstrumentField {
  key: string;
  label: string;
  /** Seção da ficha; campos da mesma seção são somados juntos. */
  section: string;
  kind: 'number' | 'check' | 'choice';
  /** Máximo do campo numérico (sem limite próprio quando ausente, ex.: fluência). */
  max?: number;
  options?: FieldOption[];
  /** Opção que vale 1 ponto (GDS, ansiedade, Katz). Sem ela, o ponto é o próprio valor. */
  scoredValue?: number;
}

export interface InstrumentSection {
  key: string;
  name: string;
}

export interface InterpretationContext {
  educationYears: number | null;
}

export interface InstrumentResult {
  total: number;
  max: number | null;
  level: ResultLevel;
  label: string;
}

interface SuggestionArea {
  area: string;
  detail: string;
}

export interface InstrumentDefinition {
  key: InstrumentKey;
  name: string;
  shortName: string;
  category: InstrumentCategory;
  summary: string;
  instructions: string;
  fields: InstrumentField[];
  sections: InstrumentSection[];
  max: number | null;
  higherIsBetter: boolean;
  totalLabel: string;
  usesEducation: boolean;
  score: (scores: InstrumentScores) => number;
  interpret: (
    total: number,
    scores: InstrumentScores,
    context: InterpretationContext,
  ) => { level: ResultLevel; label: string };
  /** Áreas a trabalhar no resultado mais recente, já em ordem de prioridade. */
  areas?: (
    scores: InstrumentScores,
    result: InstrumentResult,
    context: InterpretationContext,
  ) => SuggestionArea[];
  activities: Record<string, Activity>;
  maintain: Activity;
}

export const INSTRUMENT_CATEGORIES: ReadonlyArray<{ key: InstrumentCategory; name: string }> = [
  { key: 'cognicao', name: 'Cognição' },
  { key: 'humor', name: 'Humor' },
  { key: 'funcionalidade', name: 'Funcionalidade' },
];

// ---------- helpers ----------

export function fieldPoints(field: InstrumentField, value: number): number {
  if (field.scoredValue !== undefined) return value === field.scoredValue ? 1 : 0;
  return value;
}

function sumPoints(fields: InstrumentField[], scores: InstrumentScores): number {
  return fields.reduce((sum, field) => sum + fieldPoints(field, scores[field.key] ?? 0), 0);
}

function fieldsOf(definition: InstrumentDefinition, section: string) {
  return definition.fields.filter((field) => field.section === section);
}

export function sectionValue(
  definition: InstrumentDefinition,
  section: string,
  scores: InstrumentScores,
): number {
  return sumPoints(fieldsOf(definition, section), scores);
}

export function sectionMax(definition: InstrumentDefinition, section: string): number | null {
  let total = 0;
  for (const field of fieldsOf(definition, section)) {
    if (field.kind === 'check' || field.scoredValue !== undefined) total += 1;
    else if (field.kind === 'choice')
      total += Math.max(...(field.options ?? []).map((option) => option.value));
    else if (field.max === undefined) return null;
    else total += field.max;
  }
  return total;
}

function optionLabel(field: InstrumentField, value: number) {
  return field.options?.find((option) => option.value === value)?.label ?? String(value);
}

const formatNumber = (value: number) => String(value).replace('.', ',');

function activity(title: string, text: string, duration: string, frequency: string): Activity {
  return { title, text, duration, frequency };
}

const ORIENTATION_ACTIVITY = activity(
  'Ritual de orientação no início da sessão',
  'Começar a sessão com data, dia da semana, local e cidade, usando calendário e mapa, e pedir que a pessoa responda antes de conferir.',
  '5 min',
  'a cada sessão',
);
const RECALL_ACTIVITY = activity(
  'Evocação tardia com histórias de vida',
  'Contar uma história curta ligada à vida da pessoa e pedir que reconte 10 minutos depois, com pistas de categoria só se necessário.',
  '15 min',
  '2x por semana',
);
const REFERRAL_ACTIVITY = activity(
  'Comunicar a família e encaminhar para avaliação',
  'Compartilhar o resultado com a família ou o responsável e orientar a busca de avaliação com médico ou psicólogo. A escala é um rastreio e não fecha diagnóstico.',
  'ação única',
  'o quanto antes',
);
const FUNCTIONAL_MAINTAIN = activity(
  'Manter a independência nas atividades diárias',
  'Seguir estimulando a pessoa a fazer sozinha as atividades do dia a dia e reaplicar a escala periodicamente para acompanhar mudanças.',
  '15 min',
  '2x por semana',
);
const MOOD_MAINTAIN = activity(
  'Manter o bem-estar emocional',
  'Manter na rotina as atividades prazerosas e de convivência que a pessoa já faz e reaplicar a escala periodicamente.',
  '20 min',
  '2x por semana',
);

/** Seções abaixo do máximo, ordenadas pela maior perda proporcional. */
function deficitSections(
  definition: InstrumentDefinition,
  scores: InstrumentScores,
  limit = 3,
): SuggestionArea[] {
  return definition.sections
    .map((section, index) => {
      const value = sectionValue(definition, section.key, scores);
      const max = sectionMax(definition, section.key) ?? value;
      return { section, index, value, max, ratio: max ? (max - value) / max : 0 };
    })
    .filter((entry) => entry.value < entry.max)
    .sort((left, right) => right.ratio - left.ratio || left.index - right.index)
    .slice(0, limit)
    .map((entry) => ({
      area: entry.section.key,
      detail: `${entry.section.name}: ${entry.value}/${entry.max}`,
    }));
}

// ---------- MEEM ----------

/** Nota de corte do MEEM por anos de escolaridade (e-book, cap. 2). */
export function meemCutoff(educationYears: number | null): number | null {
  if (educationYears === null) return null;
  if (educationYears === 0) return 20;
  if (educationYears <= 4) return 25;
  if (educationYears <= 8) return 26.5;
  if (educationYears <= 11) return 28;
  return 29;
}

const meem: InstrumentDefinition = {
  key: 'meem',
  name: 'Mini Exame do Estado Mental (MEEM)',
  shortName: 'MEEM',
  category: 'cognicao',
  summary: 'Orientação, memória, atenção, cálculo, linguagem e praxia. Total de 0 a 30.',
  instructions:
    'Faça as perguntas uma a uma, sem ajudar. Registre a pontuação obtida em cada domínio.',
  fields: [
    {
      key: 'ori',
      label: 'Orientação temporal e espacial',
      section: 'ori',
      kind: 'number',
      max: 10,
    },
    { key: 'reg', label: 'Memória imediata (registro)', section: 'reg', kind: 'number', max: 3 },
    { key: 'ate', label: 'Atenção e cálculo', section: 'ate', kind: 'number', max: 5 },
    { key: 'evo', label: 'Evocação', section: 'evo', kind: 'number', max: 3 },
    { key: 'lin', label: 'Linguagem e praxia construtiva', section: 'lin', kind: 'number', max: 9 },
  ],
  sections: [
    { key: 'ori', name: 'Orientação' },
    { key: 'reg', name: 'Memória imediata' },
    { key: 'ate', name: 'Atenção e cálculo' },
    { key: 'evo', name: 'Evocação' },
    { key: 'lin', name: 'Linguagem' },
  ],
  max: 30,
  higherIsBetter: true,
  totalLabel: 'Total',
  usesEducation: true,
  score: (scores) => sumPoints(meem.fields, scores),
  interpret: (total, _scores, { educationYears }) => {
    const cutoff = meemCutoff(educationYears);
    if (cutoff === null)
      return {
        level: 'info',
        label: 'Informe a escolaridade do paciente para comparar com a nota de corte.',
      };
    return total < cutoff
      ? {
          level: 'attention',
          label: `Abaixo da nota de corte para a escolaridade (${formatNumber(cutoff)}).`,
        }
      : {
          level: 'ok',
          label: `Dentro do esperado para a escolaridade (nota de corte ${formatNumber(cutoff)}).`,
        };
  },
  activities: {},
  maintain: KEEP_ACTIVITY,
};

// ---------- MoCA ----------

const moca: InstrumentDefinition = {
  key: 'moca',
  name: 'Avaliação Cognitiva Montreal (MoCA)',
  shortName: 'MoCA',
  category: 'cognicao',
  summary: 'Mais sensível que o MEEM para comprometimento cognitivo leve. Total de 0 a 30.',
  instructions:
    'Aplique em ambiente silencioso. Registre os pontos de cada seção da ficha. Some 1 ponto se o paciente tiver 12 anos ou menos de escolaridade.',
  fields: [
    {
      key: 'vis',
      label: 'Visuoespacial e executiva (sequência, cubo e relógio)',
      section: 'vis',
      kind: 'number',
      max: 5,
    },
    { key: 'nom', label: 'Nomeação (3 animais)', section: 'nom', kind: 'number', max: 3 },
    {
      key: 'ate',
      label: 'Atenção (dígitos, letra A e subtração de 7)',
      section: 'ate',
      kind: 'number',
      max: 6,
    },
    {
      key: 'lin',
      label: 'Linguagem (repetição de frases e fluência)',
      section: 'lin',
      kind: 'number',
      max: 3,
    },
    { key: 'abs', label: 'Abstração (semelhanças)', section: 'abs', kind: 'number', max: 2 },
    {
      key: 'evo',
      label: 'Evocação tardia (sem pistas)',
      section: 'evo',
      kind: 'number',
      max: 5,
    },
    { key: 'ori', label: 'Orientação', section: 'ori', kind: 'number', max: 6 },
    {
      key: 'esc',
      label: '12 anos ou menos de escolaridade (+1 ponto)',
      section: 'esc',
      kind: 'check',
    },
  ],
  sections: [
    { key: 'vis', name: 'Visuoespacial e executiva' },
    { key: 'nom', name: 'Nomeação' },
    { key: 'ate', name: 'Atenção' },
    { key: 'lin', name: 'Linguagem' },
    { key: 'abs', name: 'Abstração' },
    { key: 'evo', name: 'Evocação tardia' },
    { key: 'ori', name: 'Orientação' },
  ],
  max: 30,
  higherIsBetter: true,
  totalLabel: 'Total',
  usesEducation: false,
  score: (scores) => Math.min(30, sumPoints(moca.fields, scores)),
  interpret: (total) =>
    total < 26
      ? { level: 'attention', label: 'Abaixo de 26: sugere comprometimento cognitivo leve.' }
      : { level: 'ok', label: '26 ou mais: dentro do esperado.' },
  areas: (scores, result) => (result.total < 26 ? deficitSections(moca, scores) : []),
  activities: {
    vis: activity(
      'Cópia de figuras e trilhas alternadas',
      'Copiar figuras geométricas simples (cubo, casa) e ligar números e letras em sequência alternada (1-A-2-B), aumentando a quantidade de pontos a cada semana.',
      '10 min',
      '2x por semana',
    ),
    nom: activity(
      'Nomeação de figuras por categorias',
      'Mostrar cartões com figuras de animais e objetos menos comuns e pedir o nome; quando houver dificuldade, dar a pista do som inicial.',
      '10 min',
      '2x por semana',
    ),
    ate: activity(
      'Sequências de números e cálculo em série',
      'Repetir sequências de números em ordem direta e inversa e fazer subtrações seriadas (100 − 7) com situações do dia a dia, como calcular troco.',
      '10 min',
      '3x por semana',
    ),
    lin: activity(
      'Repetição de frases e fluência com letras',
      'Repetir frases de complexidade crescente e dizer, em 1 minuto, palavras que comecem com uma letra combinada.',
      '10 min',
      '2x por semana',
    ),
    abs: activity(
      'Semelhanças e categorias',
      'Perguntar o que dois itens têm em comum (trem e bicicleta, relógio e régua) e pedir que a pessoa invente novos pares.',
      '10 min',
      '2x por semana',
    ),
    evo: activity(
      'Evocação de listas com pistas',
      'Apresentar uma lista de 5 palavras, conversar sobre outro assunto e pedir a lembrança após 5 minutos, usando pistas de categoria só se necessário.',
      '15 min',
      '2x por semana',
    ),
    ori: ORIENTATION_ACTIVITY,
  },
  maintain: KEEP_ACTIVITY,
};

// ---------- Teste do Relógio ----------

const clockCheck = (key: string, label: string, section: string): InstrumentField => ({
  key,
  label,
  section,
  kind: 'check',
});

const relogio: InstrumentDefinition = {
  key: 'relogio',
  name: 'Teste do Relógio',
  shortName: 'Relógio',
  category: 'cognicao',
  summary: 'Funções executivas e habilidades visuoespaciais. Total de 0 a 15.',
  instructions:
    'Peça que desenhe um relógio com todos os números e marque 11:10. Marque cada critério atendido no desenho.',
  fields: [
    clockCheck('c1', 'Desenho de contorno aceitável', 'contorno'),
    clockCheck('c2', 'Contorno com tamanho médio', 'contorno'),
    clockCheck('n1', 'De 1 a 12, sem adição ou omissão', 'numeros'),
    clockCheck('n2', 'Só algarismos arábicos', 'numeros'),
    clockCheck('n3', 'Ordem correta', 'numeros'),
    clockCheck('n4', 'Papel não é rodado quando escreve', 'numeros'),
    clockCheck('n5', 'Posição correta', 'numeros'),
    clockCheck('n6', 'Todos dentro do contorno', 'numeros'),
    clockCheck('p1', 'Com dois ponteiros e/ou marcas', 'ponteiros'),
    clockCheck('p2', 'Hora indicada de alguma maneira', 'ponteiros'),
    clockCheck('p3', 'Minutos indicados de alguma maneira', 'ponteiros'),
    clockCheck('p4', 'Na proporção correta (minutos maiores)', 'ponteiros'),
    clockCheck('p5', 'Sem marcas supérfluas', 'ponteiros'),
    clockCheck('p6', 'Ligados ou até 12 mm de proximidade', 'ponteiros'),
    clockCheck(
      'ce1',
      'Centro desenhado, inferido ou extrapolado onde os ponteiros se encontram',
      'centro',
    ),
  ],
  sections: [
    { key: 'contorno', name: 'Contorno' },
    { key: 'numeros', name: 'Números' },
    { key: 'ponteiros', name: 'Ponteiros' },
    { key: 'centro', name: 'Centro' },
  ],
  max: 15,
  higherIsBetter: true,
  totalLabel: 'Total',
  usesEducation: false,
  score: (scores) => sumPoints(relogio.fields, scores),
  interpret: (total) =>
    total <= 11
      ? {
          level: 'attention',
          label: '11 ou menos: indício de prejuízo em funções executivas e visuoespaciais.',
        }
      : { level: 'ok', label: 'Acima de 11: dentro do esperado.' },
  areas: (scores, result) => (result.total <= 11 ? deficitSections(relogio, scores) : []),
  activities: {
    contorno: activity(
      'Desenho guiado de formas',
      'Desenhar círculos e formas de tamanhos combinados, primeiro copiando um modelo e depois de memória, conferindo o tamanho e o fechamento.',
      '10 min',
      '2x por semana',
    ),
    numeros: activity(
      'Organização espacial dos números',
      'Completar mostradores de relógio começando pelos números 12, 3, 6 e 9 e depois preencher os intervalos em ordem.',
      '10 min',
      '2x por semana',
    ),
    ponteiros: activity(
      'Leitura e marcação de horas',
      'Ler horas em relógios analógicos e marcar horários do dia (refeições, remédios) num relógio de papel com ponteiros móveis, conferindo o tamanho de cada ponteiro.',
      '10 min',
      '3x por semana',
    ),
    centro: activity(
      'Planejamento antes do desenho',
      'Antes de desenhar, combinar as etapas em voz alta (contorno, centro, números e ponteiros), marcar o centro primeiro e revisar o resultado ao final.',
      '10 min',
      '2x por semana',
    ),
  },
  maintain: KEEP_ACTIVITY,
};

// ---------- Fluência verbal ----------

/** Mínimo esperado no F+A+S por escolaridade (e-book, cap. 5). */
export function fasCutoff(educationYears: number | null): number | null {
  if (educationYears === null) return null;
  if (educationYears <= 3) return 13;
  if (educationYears <= 7) return 20;
  if (educationYears <= 11) return 23;
  return 31;
}
/** Mínimo esperado de animais em 1 minuto por escolaridade (e-book, cap. 5). */
export function animalsCutoff(educationYears: number | null): number | null {
  if (educationYears === null) return null;
  return educationYears > 8 ? 13 : 8;
}

function fluencyChecks(scores: InstrumentScores, educationYears: number | null) {
  const fas = (scores.f ?? 0) + (scores.a ?? 0) + (scores.s ?? 0);
  const fasMin = fasCutoff(educationYears);
  const animalsMin = animalsCutoff(educationYears);
  return {
    fas,
    fasMin,
    animalsMin,
    fasLow: fasMin !== null && fas < fasMin,
    animalsLow: animalsMin !== null && (scores.animais ?? 0) < animalsMin,
  };
}

const fluencia: InstrumentDefinition = {
  key: 'fluencia',
  name: 'Teste de Fluência Verbal e Categórica',
  shortName: 'Fluência verbal',
  category: 'cognicao',
  summary: 'Fluência fonêmica (F, A, S) e semântica (animais), 1 minuto cada.',
  instructions:
    'Conte só os acertos: sem nomes próprios, sem palavras repetidas e sem variações do mesmo radical (gato e gata). O total é F + A + S.',
  fields: [
    { key: 'f', label: 'Letra F (acertos em 1 minuto)', section: 'f', kind: 'number' },
    { key: 'a', label: 'Letra A (acertos em 1 minuto)', section: 'a', kind: 'number' },
    { key: 's', label: 'Letra S (acertos em 1 minuto)', section: 's', kind: 'number' },
    {
      key: 'animais',
      label: 'Categoria animais (acertos em 1 minuto)',
      section: 'animais',
      kind: 'number',
    },
  ],
  sections: [
    { key: 'f', name: 'Letra F' },
    { key: 'a', name: 'Letra A' },
    { key: 's', name: 'Letra S' },
    { key: 'animais', name: 'Animais' },
  ],
  max: null,
  higherIsBetter: true,
  totalLabel: 'Total F+A+S',
  usesEducation: true,
  score: (scores) => (scores.f ?? 0) + (scores.a ?? 0) + (scores.s ?? 0),
  interpret: (_total, scores, { educationYears }) => {
    const check = fluencyChecks(scores, educationYears);
    if (check.fasMin === null || check.animalsMin === null)
      return {
        level: 'info',
        label: 'Informe a escolaridade do paciente para comparar com as notas de corte.',
      };
    const problems = [
      ...(check.fasLow ? [`F+A+S abaixo de ${check.fasMin}`] : []),
      ...(check.animalsLow ? [`animais abaixo de ${check.animalsMin}`] : []),
    ];
    return problems.length
      ? {
          level: 'attention',
          label: `Possível comprometimento: ${problems.join(' e ')} para a escolaridade.`,
        }
      : {
          level: 'ok',
          label: `Dentro do esperado (mínimos: F+A+S ${check.fasMin}, animais ${check.animalsMin}).`,
        };
  },
  areas: (scores, _result, { educationYears }) => {
    const check = fluencyChecks(scores, educationYears);
    return [
      ...(check.fasLow
        ? [{ area: 'fonemica', detail: `F+A+S: ${check.fas} (mínimo ${check.fasMin})` }]
        : []),
      ...(check.animalsLow
        ? [
            {
              area: 'semantica',
              detail: `Animais: ${scores.animais ?? 0} (mínimo ${check.animalsMin})`,
            },
          ]
        : []),
    ];
  },
  activities: {
    fonemica: activity(
      'Fluência fonêmica com letras',
      'Pedir palavras que comecem com uma letra em 1 minuto (F, A, S e outras), sem nomes próprios, e anotar o total para comparar entre as sessões.',
      '10 min',
      '2x por semana',
    ),
    semantica: activity(
      'Fluência semântica por categorias',
      'Listar em 1 minuto itens de categorias do cotidiano (animais, itens da cozinha, frutas), variando a categoria a cada sessão.',
      '10 min',
      '2x por semana',
    ),
  },
  maintain: KEEP_ACTIVITY,
};

// ---------- GDS-15 ----------

const YES_NO: FieldOption[] = [
  { value: 1, label: 'Sim' },
  { value: 0, label: 'Não' },
];
/** `scoredValue` = resposta em negrito na ficha do e-book (vale 1 ponto). */
const gdsItem = (index: number, label: string, scoredValue: 0 | 1): InstrumentField => ({
  key: `q${index}`,
  label,
  section: 'total',
  kind: 'choice',
  options: YES_NO,
  scoredValue,
});

const gds: InstrumentDefinition = {
  key: 'gds',
  name: 'Escala de Depressão Geriátrica (GDS-15)',
  shortName: 'GDS-15',
  category: 'humor',
  summary: '15 perguntas sobre as últimas duas semanas. Total de 0 a 15.',
  instructions:
    'Leia cada pergunta em voz alta e marque a resposta do paciente. Não existem respostas certas ou erradas.',
  fields: [
    gdsItem(1, 'Você está satisfeito com a sua vida?', 0),
    gdsItem(2, 'Você deixou de lado muitas de suas atividades e interesses?', 1),
    gdsItem(3, 'Você sente que sua vida está vazia?', 1),
    gdsItem(4, 'Você se sente aborrecido com frequência?', 1),
    gdsItem(5, 'Você está de bom humor na maioria das vezes?', 0),
    gdsItem(6, 'Você teme que algo de ruim lhe aconteça?', 1),
    gdsItem(7, 'Você se sente feliz na maioria das vezes?', 0),
    gdsItem(8, 'Você se sente frequentemente desamparado?', 1),
    gdsItem(9, 'Você prefere permanecer em casa a sair e fazer coisas novas?', 1),
    gdsItem(10, 'Você sente que tem mais problemas de memória que antes?', 1),
    gdsItem(11, 'Você pensa que é maravilhoso estar vivo?', 0),
    gdsItem(12, 'Você se sente inútil?', 1),
    gdsItem(13, 'Você se sente cheio de energia?', 0),
    gdsItem(14, 'Você sente que sua situação é sem esperança?', 1),
    gdsItem(15, 'Você pensa que a maioria das pessoas está melhor do que você?', 1),
  ],
  sections: [{ key: 'total', name: 'Pontuação' }],
  max: 15,
  higherIsBetter: false,
  totalLabel: 'Total',
  usesEducation: false,
  score: (scores) => sumPoints(gds.fields, scores),
  interpret: (total) => {
    if (total >= 11) return { level: 'alert', label: '11 ou mais: pode indicar depressão grave.' };
    if (total >= 5)
      return { level: 'attention', label: '5 ou mais: indicativo de sintomas depressivos.' };
    return { level: 'ok', label: 'Abaixo de 5: sem indicativo de sintomas depressivos.' };
  },
  areas: (_scores, result) => [
    ...(result.total >= 11
      ? [{ area: 'encaminhamento', detail: 'pontuação compatível com depressão grave' }]
      : []),
    ...(result.total >= 5
      ? [
          { area: 'prazer', detail: 'sintomas depressivos' },
          { area: 'convivio', detail: 'sintomas depressivos' },
        ]
      : []),
  ],
  activities: {
    encaminhamento: REFERRAL_ACTIVITY,
    prazer: activity(
      'Agenda de atividades prazerosas',
      'Montar com a pessoa uma lista de atividades de que ela gosta e encaixar pelo menos uma por dia na rotina, conversando sobre como se sentiu depois.',
      '20 min',
      'diariamente',
    ),
    convivio: activity(
      'Atividade em grupo e convivência',
      'Incluir a pessoa em atividades em grupo (oficinas, caminhadas, rodas de conversa) para reduzir o isolamento e criar compromissos fora de casa.',
      '45 min',
      '2x por semana',
    ),
  },
  maintain: MOOD_MAINTAIN,
};

// ---------- Inventário de Ansiedade Geriátrica ----------

const AGREE: FieldOption[] = [
  { value: 1, label: 'Concordo' },
  { value: 0, label: 'Discordo' },
];
const gaiItem = (index: number, label: string): InstrumentField => ({
  key: `q${index}`,
  label,
  section: 'total',
  kind: 'choice',
  options: AGREE,
  scoredValue: 1,
});

const gai: InstrumentDefinition = {
  key: 'gai',
  name: 'Inventário de Ansiedade Geriátrica',
  shortName: 'Ansiedade geriátrica',
  category: 'humor',
  summary: '20 afirmações sobre a última semana. Total de 0 a 20.',
  instructions:
    'Para cada afirmação, marque "concordo" se o paciente concorda em maior grau ou "discordo" se discorda em maior grau.',
  fields: [
    gaiItem(1, 'Eu me preocupo em grande parte do tempo.'),
    gaiItem(2, 'Eu acho difícil tomar uma decisão.'),
    gaiItem(3, 'Sinto-me agitado com frequência.'),
    gaiItem(4, 'Eu acho difícil relaxar.'),
    gaiItem(
      5,
      'Eu frequentemente não consigo aproveitar as coisas por causa de minhas preocupações.',
    ),
    gaiItem(6, 'Pequenas coisas me aborrecem muito.'),
    gaiItem(7, 'Eu frequentemente sinto como se tivesse um “frio na barriga”.'),
    gaiItem(8, 'Eu penso que sou preocupado.'),
    gaiItem(9, 'Não posso deixar de preocupar-me mesmo com coisas triviais.'),
    gaiItem(10, 'Frequentemente me sinto nervoso.'),
    gaiItem(11, 'Meus próprios pensamentos com frequência me deixam ansioso.'),
    gaiItem(12, 'Tenho dor de estômago por causa das minhas preocupações.'),
    gaiItem(13, 'Eu me vejo como uma pessoa nervosa.'),
    gaiItem(14, 'Eu sempre espero que o pior irá acontecer.'),
    gaiItem(15, 'Frequentemente me sinto tremendo por dentro.'),
    gaiItem(16, 'Eu acho que minhas preocupações interferem na minha vida.'),
    gaiItem(17, 'Minhas preocupações frequentemente me oprimem.'),
    gaiItem(18, 'Às vezes eu sinto como se tivesse um grande nó no estômago.'),
    gaiItem(19, 'Eu perco coisas por me preocupar demais.'),
    gaiItem(20, 'Frequentemente me sinto chateado.'),
  ],
  sections: [{ key: 'total', name: 'Pontuação' }],
  max: 20,
  higherIsBetter: false,
  totalLabel: 'Total de "concordo"',
  usesEducation: false,
  score: (scores) => sumPoints(gai.fields, scores),
  interpret: (total) =>
    total >= 13
      ? { level: 'attention', label: '13 ou mais: indício de sintomas de ansiedade.' }
      : { level: 'ok', label: 'Abaixo de 13: sem indício de sintomas de ansiedade.' },
  areas: (_scores, result) =>
    result.total >= 13
      ? [
          { area: 'relaxamento', detail: 'sintomas de ansiedade' },
          { area: 'preocupacoes', detail: 'sintomas de ansiedade' },
          { area: 'encaminhamento', detail: 'sintomas de ansiedade' },
        ]
      : [],
  activities: {
    relaxamento: activity(
      'Respiração e relaxamento guiado',
      'Praticar respiração lenta (inspirar em 4 tempos e soltar em 6) e relaxamento muscular progressivo no início ou no fim da sessão.',
      '10 min',
      '3x por semana',
    ),
    preocupacoes: activity(
      'Rotina previsível e momento das preocupações',
      'Combinar horários fixos para as atividades do dia e reservar um momento curto para anotar as preocupações e conversar sobre elas, sem que ocupem o resto do dia.',
      '15 min',
      'diariamente',
    ),
    encaminhamento: REFERRAL_ACTIVITY,
  },
  maintain: MOOD_MAINTAIN,
};

// ---------- Pfeffer ----------

const PFEFFER_OPTIONS: FieldOption[] = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Faz, com dificuldade' },
  { value: 2, label: 'Necessita de ajuda' },
  { value: 3, label: 'Não é capaz' },
];
const pfefferItem = (key: string, label: string): InstrumentField => ({
  key,
  label,
  section: key,
  kind: 'choice',
  options: PFEFFER_OPTIONS,
});

const pfeffer: InstrumentDefinition = {
  key: 'pfeffer',
  name: 'Questionário de Atividades Funcionais de Pfeffer',
  shortName: 'Pfeffer',
  category: 'funcionalidade',
  summary: '10 atividades instrumentais da vida diária. Total de 0 a 30.',
  instructions:
    'Pode ser respondido pelo idoso ou por um cuidador que conheça a rotina dele. Marque como ele realiza cada atividade.',
  fields: [
    pfefferItem('dinheiro', 'Manuseia o próprio dinheiro?'),
    pfefferItem('compras', 'Compra roupas, comida e coisas para casa sozinho(a)?'),
    pfefferItem('fogao', 'Esquenta a água para o café e apaga o fogo?'),
    pfefferItem('comida', 'Prepara uma comida?'),
    pfefferItem(
      'atualidades',
      'Mantém-se em dia com as atualidades e os acontecimentos da comunidade ou da vizinhança?',
    ),
    pfefferItem(
      'programas',
      'Presta atenção, entende e discute um programa de rádio ou televisão, um jornal ou uma revista?',
    ),
    pfefferItem('compromissos', 'Lembra-se de compromissos, acontecimentos familiares e feriados?'),
    pfefferItem('remedios', 'Manuseia os próprios remédios?'),
    pfefferItem('passeio', 'Passeia pela vizinhança e encontra o caminho de volta para casa?'),
    pfefferItem('sozinho', 'Pode ser deixado(a) em casa sozinho(a) de forma segura?'),
  ],
  sections: [
    { key: 'dinheiro', name: 'Dinheiro' },
    { key: 'compras', name: 'Compras' },
    { key: 'fogao', name: 'Fogão' },
    { key: 'comida', name: 'Preparar comida' },
    { key: 'atualidades', name: 'Atualidades' },
    { key: 'programas', name: 'Programas, jornal e revista' },
    { key: 'compromissos', name: 'Compromissos' },
    { key: 'remedios', name: 'Remédios' },
    { key: 'passeio', name: 'Passeio pela vizinhança' },
    { key: 'sozinho', name: 'Ficar sozinho em casa' },
  ],
  max: 30,
  higherIsBetter: false,
  totalLabel: 'Total',
  usesEducation: false,
  score: (scores) => sumPoints(pfeffer.fields, scores),
  interpret: (total) =>
    total > 6
      ? { level: 'attention', label: 'Acima de 6: indica maior dependência funcional.' }
      : { level: 'ok', label: '6 ou menos: independência funcional preservada.' },
  areas: (scores, result) => {
    // Prioriza atividades em que precisa de ajuda; acima do corte, inclui também as feitas com dificuldade.
    const minimum = result.total > 6 ? 1 : 2;
    return pfeffer.fields
      .map((field, index) => ({ field, index, value: scores[field.key] ?? 0 }))
      .filter((entry) => entry.value >= minimum)
      .sort((left, right) => right.value - left.value || left.index - right.index)
      .slice(0, 3)
      .map((entry) => ({
        area: entry.field.key,
        detail: `${pfeffer.sections[entry.index]!.name}: ${optionLabel(entry.field, entry.value).toLowerCase()}`,
      }));
  },
  activities: {
    dinheiro: activity(
      'Treino com dinheiro e troco',
      'Simular compras com notas e moedas de brinquedo, calculando o troco e conferindo o valor pago, com apoio cada vez menor.',
      '15 min',
      '2x por semana',
    ),
    compras: activity(
      'Lista de compras e mercado simulado',
      'Planejar uma lista de compras, organizá-la por setores e simular a compra; quando possível, ir ao mercado acompanhado.',
      '20 min',
      '1x por semana',
    ),
    fogao: activity(
      'Segurança na cozinha com supervisão',
      'Treinar com supervisão o passo a passo de esquentar a água e desligar o fogo, com lembretes visuais junto ao fogão.',
      '10 min',
      '2x por semana',
    ),
    comida: activity(
      'Receitas simples passo a passo',
      'Preparar receitas simples com a sequência escrita em cartões, separando os ingredientes antes de começar.',
      '30 min',
      '1x por semana',
    ),
    atualidades: activity(
      'Roda de notícias da semana',
      'Ler ou ouvir uma notícia do bairro ou da cidade e conversar sobre ela, pedindo que a pessoa reconte os pontos principais.',
      '15 min',
      '2x por semana',
    ),
    programas: activity(
      'Conversa sobre programa, jornal ou revista',
      'Assistir a um trecho curto de programa ou ler uma reportagem e conversar sobre o que foi visto, com perguntas sobre os detalhes.',
      '15 min',
      '2x por semana',
    ),
    compromissos: activity(
      'Agenda e calendário da semana',
      'Usar agenda ou calendário visível para registrar compromissos, datas da família e feriados, revisando-os juntos no início de cada sessão.',
      '10 min',
      'a cada sessão',
    ),
    remedios: activity(
      'Organização dos remédios',
      'Montar com a família uma caixa organizadora por dia e horário e treinar a conferência diária, com um responsável supervisionando.',
      '10 min',
      'diariamente',
    ),
    passeio: activity(
      'Treino de trajetos conhecidos',
      'Percorrer trajetos curtos e conhecidos acompanhado, apontando referências do caminho e pedindo que a pessoa conduza a volta.',
      '30 min',
      '1x por semana',
    ),
    sozinho: activity(
      'Plano de segurança em casa',
      'Combinar com a família rotinas de contato, telefones de emergência visíveis e ajustes na casa para os períodos em que a pessoa fica sozinha.',
      'ação única',
      'revisar mensalmente',
    ),
  },
  maintain: FUNCTIONAL_MAINTAIN,
};

// ---------- Katz ----------

/** Códigos: 0 = Independência (I), 1 = Dependência parcial (A), 2 = Dependência total (D). */
const katzItem = (
  key: string,
  label: string,
  options: [string, string, string],
): InstrumentField => ({
  key,
  label,
  section: key,
  kind: 'choice',
  scoredValue: 0,
  options: [
    { value: 0, label: 'I', description: options[0] },
    { value: 1, label: 'A', description: options[1] },
    { value: 2, label: 'D', description: options[2] },
  ],
});

const katz: InstrumentDefinition = {
  key: 'katz',
  name: 'Escala de Atividades Básicas da Vida Diária (Katz)',
  shortName: 'Katz',
  category: 'funcionalidade',
  summary: '6 atividades básicas da vida diária. Total de 0 a 6 (independência).',
  instructions:
    'Use a observação direta ou o relato do cuidador. I = independência, A = dependência parcial, D = dependência total.',
  fields: [
    katzItem('banho', 'Banho', [
      'Não recebe assistência',
      'Assistência para uma parte do corpo',
      'Não toma banho sozinho',
    ]),
    katzItem('vestuario', 'Vestuário', [
      'Veste-se sem assistência',
      'Assistência para amarrar sapatos',
      'Assistência para vestir-se',
    ]),
    katzItem('higiene', 'Higiene pessoal', [
      'Vai ao banheiro sem assistência',
      'Recebe assistência para ir ao banheiro',
      'Não vai ao banheiro para eliminações fisiológicas',
    ]),
    katzItem('transferencia', 'Transferência', [
      'Deita-se, levanta-se e senta-se sem assistência',
      'Deita-se, levanta-se e senta-se com assistência',
      'Não se levanta da cama',
    ]),
    katzItem('continencia', 'Continência', [
      'Controle esfincteriano completo',
      'Acidentes ocasionais',
      'Supervisão, uso de cateter ou incontinente',
    ]),
    katzItem('alimentacao', 'Alimentação', [
      'Sem assistência',
      'Assistência para cortar carne ou passar manteiga no pão',
      'Com assistência, ou sondas, ou fluidos EV',
    ]),
  ],
  sections: [
    { key: 'banho', name: 'Banho' },
    { key: 'vestuario', name: 'Vestuário' },
    { key: 'higiene', name: 'Higiene pessoal' },
    { key: 'transferencia', name: 'Transferência' },
    { key: 'continencia', name: 'Continência' },
    { key: 'alimentacao', name: 'Alimentação' },
  ],
  max: 6,
  higherIsBetter: true,
  totalLabel: 'Atividades com independência',
  usesEducation: false,
  score: (scores) => sumPoints(katz.fields, scores),
  interpret: (total, scores) => {
    const values = katz.fields.map((field) => scores[field.key] ?? 0);
    if (total === 6) return { level: 'ok', label: 'Independente em todas as atividades básicas.' };
    const dependent = 6 - total;
    const label = `Dependência em ${dependent} ${dependent === 1 ? 'atividade básica' : 'atividades básicas'}.`;
    return { level: values.includes(2) ? 'alert' : 'attention', label };
  },
  areas: (scores) =>
    katz.fields
      .map((field, index) => ({ field, index, value: scores[field.key] ?? 0 }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value || left.index - right.index)
      .slice(0, 3)
      .map((entry) => ({
        area: entry.field.key,
        detail: `${entry.field.label}: ${entry.value === 2 ? 'dependência total' : 'dependência parcial'}`,
      })),
  activities: {
    banho: activity(
      'Treino do banho com adaptações',
      'Treinar a sequência do banho com supervisão, usando barras de apoio, banco e tapete antiderrapante para dar autonomia com segurança.',
      '20 min',
      'conforme a rotina de banho',
    ),
    vestuario: activity(
      'Treino de vestir-se',
      'Separar as roupas na ordem de vestir e treinar botões, zíperes e cadarços, preferindo roupas e calçados fáceis de ajustar.',
      '15 min',
      'diariamente',
    ),
    higiene: activity(
      'Autonomia para ir ao banheiro',
      'Deixar o caminho iluminado e livre, instalar apoio próximo ao vaso e treinar a ida ao banheiro com supervisão.',
      '10 min',
      'diariamente',
    ),
    transferencia: activity(
      'Exercícios de sentar e levantar',
      'Treinar sentar e levantar da cadeira e da cama com apoio, fortalecendo pernas e tronco com repetições progressivas.',
      '15 min',
      '3x por semana',
    ),
    continencia: activity(
      'Rotina de idas ao banheiro',
      'Estabelecer horários regulares para ir ao banheiro e combinar com a família o registro dos episódios para levar à equipe de saúde.',
      '5 min',
      'diariamente',
    ),
    alimentacao: activity(
      'Autonomia na alimentação',
      'Treinar o uso de talheres e utensílios adaptados (cabos engrossados, pratos com borda), com tempo suficiente durante as refeições.',
      '15 min',
      'nas refeições',
    ),
  },
  maintain: FUNCTIONAL_MAINTAIN,
};

// ---------- CDR ----------

const cdrItem = (
  key: string,
  label: string,
  descriptions: Array<[number, string]>,
): InstrumentField => ({
  key,
  label,
  section: key,
  kind: 'choice',
  options: descriptions.map(([value, description]) => ({
    value,
    label: `CDR ${formatNumber(value)}`,
    description,
  })),
});

const CDR_STAGES: Record<string, string> = {
  '0': 'Nenhuma demência',
  '0.5': 'Comprometimento cognitivo leve (demência questionável)',
  '1': 'Demência leve',
  '2': 'Demência moderada',
  '3': 'Demência grave',
};

const cdr: InstrumentDefinition = {
  key: 'cdr',
  name: 'Escala CDR (Clinical Dementia Rating)',
  shortName: 'CDR',
  category: 'funcionalidade',
  summary: '6 domínios cognitivos e funcionais. Escore global de 0 a 3.',
  instructions:
    'Entreviste o paciente e um informante que o conheça bem. Marque o grau que melhor descreve cada domínio; o escore global é o do domínio mais pontuado.',
  fields: [
    cdrItem('memoria', 'Memória', [
      [0, 'Sem perda de memória, ou apenas esquecimento discreto e inconsistente.'],
      [
        0.5,
        'Esquecimento leve e consistente; lembrança parcial de eventos; "esquecimento benigno".',
      ],
      [
        1,
        'Perda de memória moderada, mais acentuada para fatos recentes; o déficit interfere nas atividades do dia a dia.',
      ],
      [
        2,
        'Perda de memória grave; apenas material muito aprendido é retido; materiais novos são rapidamente perdidos.',
      ],
      [3, 'Perda de memória grave; permanecem apenas fragmentos.'],
    ]),
    cdrItem('orientacao', 'Orientação', [
      [0, 'Plenamente orientado.'],
      [0.5, 'Plenamente orientado, com leve dificuldade nas relações temporais.'],
      [
        1,
        'Dificuldade moderada com relações temporais; orientado no espaço durante o exame, mas pode ter desorientação geográfica em outros locais.',
      ],
      [2, 'Geralmente desorientado.'],
      [3, 'Orientação pessoal apenas.'],
    ]),
    cdrItem('julgamento', 'Julgamento e solução de problemas', [
      [
        0,
        'Resolve bem os problemas do dia a dia; juízo crítico bom em relação ao desempenho passado.',
      ],
      [0.5, 'Leve comprometimento na solução de problemas, semelhanças e diferenças.'],
      [
        1,
        'Dificuldade moderada na solução de problemas, semelhanças e diferenças; julgamento social geralmente mantido.',
      ],
      [
        2,
        'Solução de problemas, semelhanças e diferenças gravemente comprometidas; juízo social geralmente comprometido.',
      ],
      [3, 'Incapaz de resolver problemas ou de ter qualquer juízo crítico.'],
    ]),
    cdrItem('comunidade', 'Assuntos na comunidade', [
      [
        0,
        'Atuação independente na função habitual de trabalho, compras, negócios, finanças e grupos sociais.',
      ],
      [0.5, 'Leve dificuldade nessas atividades.'],
      [
        1,
        'Incapaz de funcionar independentemente nessas atividades, embora ainda possa desempenhar algumas; pode parecer normal à avaliação superficial.',
      ],
      [
        2,
        'Sem possibilidade de desempenho fora de casa; parece suficientemente bem para ser levado a atividades fora de casa.',
      ],
      [
        3,
        'Sem possibilidade de desempenho fora de casa; parece muito doente para ser levado a atividades fora de casa.',
      ],
    ]),
    cdrItem('lar', 'Lar e passatempos', [
      [0, 'Vida em casa, passatempos e interesses intelectuais mantidos.'],
      [0.5, 'Vida em casa, passatempos e interesses intelectuais levemente afetados.'],
      [
        1,
        'Comprometimento leve, mas evidente em casa; abandono das tarefas mais difíceis e dos passatempos mais complicados.',
      ],
      [2, 'Só realiza as tarefas mais simples; interesses muito limitados e pouco mantidos.'],
      [3, 'Sem qualquer atividade significativa em casa.'],
    ]),
    cdrItem('cuidados', 'Cuidados pessoais', [
      [0, 'Plenamente capaz.'],
      [1, 'Necessita de assistência ocasional.'],
      [2, 'Requer assistência no vestir e na higiene.'],
      [3, 'Requer muito auxílio nos cuidados pessoais; geralmente incontinente.'],
    ]),
  ],
  sections: [
    { key: 'memoria', name: 'Memória' },
    { key: 'orientacao', name: 'Orientação' },
    { key: 'julgamento', name: 'Julgamento e solução de problemas' },
    { key: 'comunidade', name: 'Assuntos na comunidade' },
    { key: 'lar', name: 'Lar e passatempos' },
    { key: 'cuidados', name: 'Cuidados pessoais' },
  ],
  max: 3,
  higherIsBetter: false,
  totalLabel: 'Escore global',
  usesEducation: false,
  // Regra do e-book: o paciente fica no grau do domínio mais pontuado.
  score: (scores) => Math.max(...cdr.fields.map((field) => scores[field.key] ?? 0)),
  interpret: (total) => {
    const stage = CDR_STAGES[String(total)] ?? '';
    const level: ResultLevel = total === 0 ? 'ok' : total === 0.5 ? 'attention' : 'alert';
    return { level, label: `CDR ${formatNumber(total)}: ${stage} (classificação da escala).` };
  },
  areas: (scores) =>
    cdr.fields
      .map((field, index) => ({ field, index, value: scores[field.key] ?? 0 }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value || left.index - right.index)
      .slice(0, 3)
      .map((entry) => ({
        area: entry.field.key,
        detail: `${entry.field.label}: CDR ${formatNumber(entry.value)}`,
      })),
  activities: {
    memoria: RECALL_ACTIVITY,
    orientacao: ORIENTATION_ACTIVITY,
    julgamento: activity(
      'Resolução de problemas do cotidiano',
      'Apresentar situações do dia a dia (o que fazer se faltar luz, como organizar uma visita) e discutir as soluções possíveis, passo a passo.',
      '15 min',
      '2x por semana',
    ),
    comunidade: activity(
      'Participação social acompanhada',
      'Manter atividades fora de casa com acompanhamento (grupo, igreja, feira), adaptando o tempo e a complexidade ao que a pessoa consegue fazer.',
      '45 min',
      '1x por semana',
    ),
    lar: activity(
      'Retomar passatempos simplificados',
      'Escolher um passatempo antigo da pessoa e dividi-lo em etapas mais simples, para que ela participe do começo ao fim.',
      '20 min',
      '3x por semana',
    ),
    cuidados: activity(
      'Rotina de autocuidado com apoio',
      'Organizar a rotina de higiene e vestuário em etapas com lembretes visuais, oferecendo ajuda só no passo em que ela for necessária.',
      '15 min',
      'diariamente',
    ),
  },
  maintain: FUNCTIONAL_MAINTAIN,
};

// ---------- catálogo ----------

export const INSTRUMENTS: readonly InstrumentDefinition[] = [
  meem,
  moca,
  relogio,
  fluencia,
  gds,
  gai,
  pfeffer,
  katz,
  cdr,
];
export const INSTRUMENT_KEYS = INSTRUMENTS.map((definition) => definition.key);

export function getInstrument(key: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((definition) => definition.key === key);
}

/** Avaliações antigas (antes dos múltiplos testes) não têm instrumento: são MEEM. */
export function instrumentOf(evaluation: { instrument?: string | null }): InstrumentKey {
  return (evaluation.instrument as InstrumentKey | undefined) ?? 'meem';
}

/** Limite de contagens sem máximo próprio (ex.: palavras em 1 minuto na fluência). */
const MAX_COUNT = 99;

/** Valida as respostas de uma ficha. Devolve as pontuações ou a mensagem do primeiro erro. */
export function validateInstrumentScores(
  definition: InstrumentDefinition,
  input: Record<string, unknown>,
): { scores: InstrumentScores } | { error: string } {
  const scores: InstrumentScores = {};
  for (const field of definition.fields) {
    const value = input[field.key];
    if (field.kind === 'number') {
      const max = field.max ?? MAX_COUNT;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max)
        return {
          error: `A pontuação de "${field.label}" deve ser um número inteiro entre 0 e ${max}.`,
        };
    } else if (field.kind === 'check') {
      if (value !== 0 && value !== 1)
        return { error: `Marque ou desmarque o item "${field.label}".` };
    } else if (!field.options?.some((option) => option.value === value)) {
      return { error: `Responda o item "${field.label}".` };
    }
    scores[field.key] = value as number;
  }
  return { scores };
}

export function evaluateInstrument(
  definition: InstrumentDefinition,
  scores: InstrumentScores,
  context: InterpretationContext,
): InstrumentResult {
  const total = definition.score(scores);
  return { total, max: definition.max, ...definition.interpret(total, scores, context) };
}

export interface TrendResult {
  kind: 'none' | 'first' | 'up' | 'down' | 'stable';
  label: string;
  delta: number | null;
  tone: 'good' | 'bad' | 'neutral';
}

/** Tendência entre os dois últimos totais; `tone` considera se subir é melhor ou pior. */
export function instrumentTrend(totals: number[], higherIsBetter: boolean): TrendResult {
  if (totals.length === 0)
    return { kind: 'none', label: 'sem avaliações', delta: null, tone: 'neutral' };
  if (totals.length === 1)
    return { kind: 'first', label: 'primeira avaliação', delta: null, tone: 'neutral' };
  const delta = totals.at(-1)! - totals.at(-2)!;
  if (delta === 0) return { kind: 'stable', label: '● estável', delta, tone: 'neutral' };
  const improved = delta > 0 === higherIsBetter;
  return {
    kind: delta > 0 ? 'up' : 'down',
    label: delta > 0 ? `▲ subiu ${formatNumber(delta)}` : `▼ caiu ${formatNumber(Math.abs(delta))}`,
    delta,
    tone: improved ? 'good' : 'bad',
  };
}

export interface StoredEvaluation {
  date: string;
  instrument?: string | null;
  scores: InstrumentScores;
}

export interface PatientSuggestion extends Suggestion {
  instrument: InstrumentKey;
}

/** Sugestões de um teste a partir do resultado mais recente (e da piora em relação ao anterior). */
export function generateInstrumentSuggestions(
  patientId: string,
  definition: InstrumentDefinition,
  evaluations: Array<{ date: string; scores: InstrumentScores }>,
  context: InterpretationContext,
): PatientSuggestion[] {
  if (definition.key === 'meem') {
    return generateSuggestions({
      id: patientId,
      evaluations: evaluations.map((entry) => ({
        date: entry.date,
        scores: entry.scores as MeemScores,
      })),
    }).map((suggestion) => ({ ...suggestion, instrument: 'meem' }));
  }
  const last = evaluations.at(-1);
  if (!last) return [];
  const previous = evaluations.at(-2);
  const result = evaluateInstrument(definition, last.scores, context);
  const previousTotal = previous ? definition.score(previous.scores) : null;
  const worse =
    previousTotal !== null &&
    (definition.higherIsBetter ? result.total < previousTotal : result.total > previousTotal);
  const range = definition.max === null ? '' : `/${formatNumber(definition.max)}`;
  const summary = `${definition.shortName}: ${formatNumber(result.total)}${range} em ${last.date}. ${result.label}`;
  const change = worse
    ? ` Piorou desde a avaliação anterior (${formatNumber(previousTotal!)}${range} em ${previous!.date}).`
    : '';
  const sources = worse ? [previous!.date, last.date] : [last.date];
  const areas = (definition.areas?.(last.scores, result, context) ?? []).filter(
    (entry) => definition.activities[entry.area],
  );
  if (!areas.length) {
    return [
      {
        key: `${patientId}:${definition.key}:manter`,
        instrument: definition.key,
        domain: 'keep',
        activity: definition.maintain,
        why: `${summary}${change}`,
        sources,
        fell: worse,
        lastDate: worse ? last.date : null,
      },
    ];
  }
  return areas.map((entry) => ({
    key: `${patientId}:${definition.key}:${entry.area}`,
    instrument: definition.key,
    domain: 'keep',
    activity: definition.activities[entry.area]!,
    why: `${summary} Ponto de atenção: ${entry.detail}.${change}`,
    sources,
    fell: worse,
    lastDate: worse ? last.date : null,
  }));
}

/** Todas as sugestões do paciente, agrupadas na ordem do catálogo de testes. */
export function generatePatientSuggestions(patient: {
  id: string;
  evaluations: StoredEvaluation[];
  educationYears: number | null;
}): PatientSuggestion[] {
  return INSTRUMENTS.flatMap((definition) =>
    generateInstrumentSuggestions(
      patient.id,
      definition,
      patient.evaluations.filter((entry) => instrumentOf(entry) === definition.key),
      { educationYears: patient.educationYears },
    ),
  );
}
