import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_RELATIONSHIPS,
  LIMITATIONS,
  MEEM_DOMAINS,
  PATIENT_GROUPS,
  PRODUCT_PRINCIPLE,
  TRIAL_PROFILES,
} from './index';

describe('constantes compartilhadas do setup', () => {
  it('preserva os domínios MEEM, a ordem e as pontuações máximas do protótipo', () => {
    expect(MEEM_DOMAINS).toEqual([
      { key: 'ori', name: 'Orientação', max: 10 },
      { key: 'reg', name: 'Memória imediata', max: 3 },
      { key: 'ate', name: 'Atenção e cálculo', max: 5 },
      { key: 'evo', name: 'Evocação', max: 3 },
      { key: 'lin', name: 'Linguagem', max: 9 },
    ]);
    expect(MEEM_DOMAINS.reduce((sum, domain) => sum + domain.max, 0)).toBe(30);
  });

  it('preserva as opções de formulário e o princípio exibido no protótipo', () => {
    expect(PATIENT_GROUPS).toEqual(['Individual', 'Grupo da manhã', 'Grupo da tarde']);
    expect(LIMITATIONS).toEqual(['Sem limitação', 'Leve', 'Importante']);
    expect(EMERGENCY_RELATIONSHIPS).toHaveLength(7);
    expect(TRIAL_PROFILES).toHaveLength(7);
    expect(PRODUCT_PRINCIPLE).toBe(
      'A tecnologia sugere. O profissional decide. As sugestões não são diagnóstico nem prescrição.',
    );
  });
});
