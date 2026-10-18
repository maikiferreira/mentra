// Identificação do paciente: nome completo e iniciais derivadas dele.

/** Partículas que não entram nas iniciais ("Maria da Silva" → "M.S."). */
const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'di', 'du', 'van', 'von']);

/** Iniciais do nome completo, no formato "M.S."; até 5 letras. */
export function initialsFromName(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !PARTICLES.has(word.toLowerCase()))
    .map((word) => word.charAt(0).toLocaleUpperCase('pt-BR'))
    .slice(0, 5);
  return letters.length ? `${letters.join('.')}.` : '';
}

/** Nome para exibir: o completo, ou as iniciais para pacientes cadastrados antes do nome. */
export function patientDisplayName(patient: { name?: string | null; initials: string }): string {
  return patient.name?.trim() || patient.initials;
}
