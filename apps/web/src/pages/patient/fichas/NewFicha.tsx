import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  INSTRUMENTS,
  INSTRUMENT_CATEGORIES,
  evaluateInstrument,
  getInstrument,
  type InstrumentCategory,
  type InstrumentDefinition,
  type InstrumentField,
  type InstrumentKey,
  type FichaSavedDto,
  type InstrumentScores,
} from '@mente-ativa/shared';
import { jsonBody, type FichaDetail, type Patient } from '../../../api';
import { useUIStore } from '../../../ui-store';
import { ErrorNote } from '../../../components/Feedback';
import { client } from '../../../lib/client';
import { LEVEL_CHIP, MAX_COUNT, scoreText, todayISO } from '../../../lib/format';

/** Rascunho do formulário: números e escolhas como texto, '' = ainda sem resposta. */
type Draft = Record<string, string>;

function initialDraft(definition: InstrumentDefinition, patient: Patient): Draft {
  return Object.fromEntries(
    definition.fields.map((field) => {
      if (field.kind !== 'check') return [field.key, ''];
      // MoCA: já marca o ponto de escolaridade quando o cadastro indica 12 anos ou menos.
      const bonus =
        definition.key === 'moca' &&
        field.key === 'esc' &&
        patient.educationYears !== null &&
        patient.educationYears <= 12;
      return [field.key, bonus ? '1' : '0'];
    }),
  );
}

function parseDraft(definition: InstrumentDefinition, draft: Draft) {
  const scores: InstrumentScores = {};
  const invalid = new Set<string>();
  let missing = 0;
  for (const field of definition.fields) {
    const raw = draft[field.key] ?? '';
    if (raw === '') {
      missing += 1;
      continue;
    }
    if (field.kind === 'number' && (!/^\d+$/.test(raw) || Number(raw) > (field.max ?? MAX_COUNT))) {
      invalid.add(field.key);
      continue;
    }
    scores[field.key] = Number(raw);
  }
  return { scores, invalid, missing };
}

/** Formulário de uma ficha: registra uma nova ou, com `editing`, corrige uma já salva. */
export function InstrumentForm({
  definition,
  patient,
  id,
  editing,
  onBack,
  onCancel,
  onSaved,
}: {
  definition: InstrumentDefinition;
  patient: Patient;
  id: string;
  editing?: FichaDetail;
  onBack?: () => void;
  onCancel: () => void;
  onSaved?: (date: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [date, setDate] = useState(() => editing?.dateISO ?? todayISO());
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? Object.fromEntries(
          definition.fields.map((field) => [field.key, String(editing.scores[field.key] ?? '')]),
        )
      : initialDraft(definition, patient),
  );
  const [observations, setObservations] = useState(editing?.observations ?? '');
  const parsed = parseDraft(definition, draft);
  const complete = Boolean(date) && parsed.missing === 0 && parsed.invalid.size === 0;
  const preview = evaluateInstrument(definition, parsed.scores, {
    educationYears: patient.educationYears,
  });
  const change = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      editing
        ? client<FichaSavedDto>(`/patients/${id}/fichas/${editing.id}`, {
            method: 'PUT',
            body: jsonBody({ date, scores: parsed.scores, observations }),
          })
        : client<FichaSavedDto>(`/patients/${id}/fichas`, {
            method: 'POST',
            body: jsonBody({
              instrument: definition.key,
              date,
              scores: parsed.scores,
              observations,
            }),
          }),
    onSuccess: async ({ evaluation }) => {
      if (!editing) useUIStore.getState().markRegistered(id, evaluation.date);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fichas', id] }),
        queryClient.invalidateQueries({ queryKey: ['patient', id] }),
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['evolution', id] }),
        queryClient.invalidateQueries({ queryKey: ['ficha', id] }),
        queryClient.invalidateQueries({ queryKey: ['overview', id] }),
        queryClient.invalidateQueries({ queryKey: ['routines'] }),
      ]);
      if (onSaved) onSaved(evaluation.date);
      else navigate(`/pacientes/${id}/evolucao`, { state: { instrument: definition.key } });
    },
  });
  // Seções com mais de um campo viram blocos com título (ex.: Contorno, Números do relógio).
  const grouped = definition.sections.length > 1;
  const questionNumber = new Map(
    definition.fields
      .filter((field) => field.kind === 'choice')
      .map((field, index) => [field.key, index + 1]),
  );
  const renderField = (field: InstrumentField) => {
    const value = draft[field.key] ?? '';
    if (field.kind === 'check')
      return (
        <label className="fld-check" key={field.key}>
          <input
            type="checkbox"
            checked={value === '1'}
            onChange={(event) => change(field.key, event.target.checked ? '1' : '0')}
          />
          <span>{field.label}</span>
        </label>
      );
    if (field.kind === 'choice') {
      return (
        <fieldset className="fld-choice" key={field.key}>
          <legend>
            {questionNumber.get(field.key)}. {field.label}
          </legend>
          <div
            className={`opts ${field.options!.some((option) => option.description) ? 'long' : ''}`}
          >
            {field.options!.map((option) => (
              <label
                className={`opt ${value === String(option.value) ? 'on' : ''}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name={`f-${field.key}`}
                  value={option.value}
                  checked={value === String(option.value)}
                  onChange={() => change(field.key, String(option.value))}
                />
                <span>
                  <b>{option.label}</b>
                  {option.description && <small>{option.description}</small>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    const invalid = parsed.invalid.has(field.key);
    const max = field.max ?? MAX_COUNT;
    return (
      <div className={`fld ${invalid ? 'invalid' : ''}`} key={field.key}>
        <div>
          <label htmlFor={`f-${field.key}`}>
            {field.label}
            {field.max !== undefined ? ` (máx. ${field.max})` : ''}
          </label>
          {invalid && <small>Use um número inteiro de 0 a {max}.</small>}
        </div>
        <input
          id={`f-${field.key}`}
          type="number"
          inputMode="numeric"
          required
          min={0}
          max={max}
          step={1}
          aria-invalid={invalid}
          value={value}
          onChange={(event) => change(field.key, event.target.value)}
        />
      </div>
    );
  };
  return (
    <form
      className="panel"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) save.mutate();
      }}
    >
      <div className="head-row">
        <h2>
          {editing ? 'Editar ficha' : 'Nova ficha'} · {definition.shortName}
        </h2>
        {onBack && (
          <button className="btn small" type="button" onClick={onBack}>
            Trocar teste
          </button>
        )}
      </div>
      <p className="muted">{definition.name}</p>
      <p className="srcnote" style={{ marginBottom: 14 }}>
        {definition.instructions}
      </p>
      <div className="fields">
        <ErrorNote error={save.error} />
        <div className="fld wide">
          <label htmlFor="f-date">Data da avaliação</label>
          <input
            id="f-date"
            type="date"
            required
            max={todayISO()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {grouped
          ? definition.sections.map((section) => {
              const fields = definition.fields.filter((field) => field.section === section.key);
              return fields.length > 1 ? (
                <fieldset className="fgroup" key={section.key}>
                  <legend>{section.name}</legend>
                  {fields.map(renderField)}
                </fieldset>
              ) : (
                fields.map(renderField)
              );
            })
          : null}
        {/* Campos fora das seções resumidas (ex.: ponto de escolaridade do MoCA) ou testes de seção única. */}
        {definition.fields
          .filter(
            (field) =>
              !grouped || !definition.sections.some((section) => section.key === field.section),
          )
          .map(renderField)}
        <div
          className={`note ${complete ? (LEVEL_CHIP[preview.level] === 'up' ? 'ok' : preview.level === 'info' ? '' : 'warn') : ''}`}
          role="status"
        >
          <b>
            {definition.totalLabel}: {scoreText(preview.total, preview.max)}
          </b>
          {complete
            ? ` · ${preview.label}`
            : ` · ${parsed.missing ? 'responda todos os itens' : 'corrija os campos destacados'}`}
        </div>
        <div className="obs">
          <label htmlFor="f-obs">Observações</label>
          <textarea
            id="f-obs"
            maxLength={2000}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!complete || save.isPending}>
            {editing ? 'Salvar alterações' : 'Salvar ficha e atualizar evolução'}
          </button>
          <button className="btn" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        {!complete && (
          <p className="srcnote">Preencha a data e todos os itens do teste para salvar.</p>
        )}
      </div>
    </form>
  );
}

export function NewFicha({
  patient,
  id,
  initialInstrument,
  onCancel,
}: {
  patient: Patient;
  id: string;
  initialInstrument?: InstrumentKey | undefined;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<InstrumentCategory>(
    () => (initialInstrument && getInstrument(initialInstrument)?.category) || 'cognicao',
  );
  const [instrument, setInstrument] = useState<InstrumentKey | null>(initialInstrument ?? null);
  const definition = instrument ? getInstrument(instrument) : undefined;
  if (definition)
    return (
      <InstrumentForm
        key={definition.key}
        definition={definition}
        patient={patient}
        id={id}
        onBack={() => setInstrument(null)}
        onCancel={onCancel}
      />
    );
  return (
    <div className="panel">
      <h2>Nova ficha</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Escolha a área e o teste aplicado ao paciente.
      </p>
      <div className="seg" role="tablist" aria-label="Áreas de avaliação">
        {INSTRUMENT_CATEGORIES.map((entry) => (
          <button
            type="button"
            role="tab"
            className="segb"
            key={entry.key}
            aria-selected={category === entry.key}
            onClick={() => setCategory(entry.key)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="tests" role="tabpanel">
        {INSTRUMENTS.filter((entry) => entry.category === category).map((entry) => (
          <button
            type="button"
            className="testb"
            key={entry.key}
            onClick={() => setInstrument(entry.key)}
          >
            <b>{entry.shortName}</b>
            <span className="muted">{entry.summary}</span>
          </button>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
