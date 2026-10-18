import { describe, expect, it } from 'vitest';
import { initialsFromName, patientDisplayName } from './patients';

describe('identificação do paciente', () => {
  it('gera as iniciais do nome completo ignorando partículas', () => {
    expect(initialsFromName('Maria da Silva')).toBe('M.S.');
    expect(initialsFromName('  josé   de souza  ALMEIDA ')).toBe('J.S.A.');
    expect(initialsFromName('Ângela dos Santos e Lima')).toBe('Â.S.L.');
    expect(initialsFromName('Ana Beatriz Carla Dias Esteves Fonseca')).toBe('A.B.C.D.E.');
    expect(initialsFromName('')).toBe('');
  });

  it('mostra o nome completo ou, sem ele, as iniciais', () => {
    expect(patientDisplayName({ name: 'Maria da Silva', initials: 'M.S.' })).toBe('Maria da Silva');
    expect(patientDisplayName({ name: '', initials: 'M.S.' })).toBe('M.S.');
    expect(patientDisplayName({ initials: 'R.L.' })).toBe('R.L.');
  });
});
