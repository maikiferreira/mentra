import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getInstrument, type InstrumentKey } from '@mente-ativa/shared';
import { jsonBody, type Evolution, type InstrumentEvolution } from '../../api';
import { useUIStore } from '../../ui-store';
import { ErrorNote, Loading } from '../../components/Feedback';
import { client } from '../../lib/client';
import { LEVEL_CHIP, TONE_CHIP, formatScore, scoreText } from '../../lib/format';
import { SuggestionCard } from './SuggestionCard';
import { usePatientContext } from './context';

function chart(instrument: InstrumentEvolution) {
  const series = instrument.series;
  const width = 560,
    height = 230,
    left = 40,
    right = 44,
    top = 16,
    bottom = 36;
  const values = series.map((entry) => entry.total);
  // Teto: máximo do teste; sem máximo (fluência), um pouco acima do maior valor.
  const max = instrument.max ?? Math.max(10, Math.ceil((Math.max(...values) * 1.25) / 5) * 5);
  // MEEM: aproxima o eixo da faixa usual, sem cortar valores baixos.
  const min =
    instrument.key === 'meem'
      ? Math.max(0, Math.min(16, Math.floor(Math.min(...values) / 2) * 2 - 2))
      : 0;
  // Marcações em números redondos (meio ponto em escalas curtas, como a CDR).
  const step = max - min >= 8 ? 1 : 0.5;
  const ticks = [
    ...new Set(
      [1, 2, 3, 4].map((index) => Math.round((min + ((max - min) * index) / 4) / step) * step),
    ),
  ];
  const x = (index: number) =>
    series.length === 1
      ? left + (width - left - right) / 2
      : left + (index * (width - left - right)) / (series.length - 1);
  const y = (value: number) => top + ((max - value) * (height - top - bottom)) / (max - min);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${instrument.totalLabel} do ${instrument.shortName} por avaliação`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">
            {formatScore(value)}
          </text>
        </g>
      ))}
      {series.length > 1 && (
        <polyline
          className="ln"
          points={series.map((entry, index) => `${x(index)},${y(entry.total)}`).join(' ')}
        />
      )}
      {series.map((entry, index) => (
        <g key={entry.date}>
          <circle
            className={`pt ${index === series.length - 1 ? 'last' : ''}`}
            cx={x(index)}
            cy={y(entry.total)}
            r="6"
          />
          <text className="val" x={x(index)} y={y(entry.total) - 12} textAnchor="middle">
            {formatScore(entry.total)}
          </text>
          <text x={x(index)} y={height - 12} textAnchor="middle">
            {entry.date}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function EvolutionPage() {
  const { patient, id } = usePatientContext();
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['evolution', id],
    queryFn: () => client<Evolution>(`/patients/${id}/evolution`),
  });
  const [selected, setSelected] = useState<InstrumentKey | null>(
    (location.state as { instrument?: InstrumentKey } | null)?.instrument ?? null,
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const freshDate = useUIStore((state) => state.justRegistered[id]);
  const update = useMutation({
    mutationFn: ({
      key,
      patch,
    }: {
      key: string;
      patch: { status?: string; customText?: string };
    }) =>
      client(`/patients/${id}/suggestions/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: jsonBody(patch),
      }),
    onSuccess: async () => {
      setEditingKey(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['evolution', id] }),
        queryClient.invalidateQueries({ queryKey: ['routines'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: setError,
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const evolution = query.data!;
  const current =
    evolution.instruments.find((entry) => entry.key === selected) ??
    evolution.instruments.find((entry) => entry.key === evolution.latestInstrument) ??
    evolution.instruments[0];
  const suggestions = evolution.suggestions.filter(
    (suggestion) => suggestion.instrument === current?.key,
  );
  const action = (key: string, status: 'open' | 'ok' | 'no') =>
    update.mutate({ key, patch: { status } });
  if (!current)
    return (
      <div className="panel">
        <h2>Ainda não há avaliações</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Registre a primeira ficha deste paciente para ver a evolução e receber sugestões.
        </p>
        <Link className="btn primary" to={`/pacientes/${id}`}>
          Ir para as fichas
        </Link>
      </div>
    );
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Testes aplicados">
        {evolution.instruments.map((entry) => (
          <button
            type="button"
            role="tab"
            className="segb"
            key={entry.key}
            aria-selected={entry.key === current.key}
            onClick={() => setSelected(entry.key)}
          >
            {entry.shortName}{' '}
            <span className={`chip ${LEVEL_CHIP[entry.latest.level]}`}>
              {scoreText(entry.latest.total, entry.latest.max)}
            </span>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="head-row">
          <h2>Evolução do total ({current.shortName})</h2>
          <span className={`chip ${TONE_CHIP[current.trend.tone]}`}>{current.trend.label}</span>
        </div>
        <div className="chartbox">{chart(current)}</div>
        <div
          className={`note ${LEVEL_CHIP[current.latest.level] === 'up' ? 'ok' : current.latest.level === 'info' ? '' : 'warn'}`}
        >
          <b>
            Último resultado ({current.latest.date}):{' '}
            {scoreText(current.latest.total, current.latest.max)}
          </b>{' '}
          · {current.latest.label}
        </div>
        <p className="srcnote">
          {current.name}.{' '}
          {current.higherIsBetter
            ? 'Quanto maior a pontuação, melhor o desempenho.'
            : 'Quanto maior a pontuação, maior o comprometimento.'}
          {current.series.length === 1
            ? ' Esta é a primeira avaliação; a comparação começa na próxima ficha.'
            : ''}
        </p>
      </div>
      {current.delta && (
        <div className="panel">
          <h2>O que mudou desde a avaliação anterior</h2>
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>{current.delta.rows.length > 1 ? 'Item' : 'Pontuação'}</th>
                  <th className="num">{current.delta.previousDate}</th>
                  <th className="num">{current.delta.lastDate}</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                {current.delta.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td className="num">{scoreText(row.previous, row.max)}</td>
                    <td className="num">{scoreText(row.last, row.max)}</td>
                    <td>
                      <span className={`chip ${TONE_CHIP[row.tone]}`}>{row.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ErrorNote error={error || update.error} />
      <div>
        <h2 style={{ marginBottom: 12 }}>Sugestões para a rotina ({current.shortName})</h2>
        <div className="stack" style={{ gap: 12 }}>
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.key}
              suggestion={suggestion}
              patient={patient}
              freshDate={freshDate}
              editing={editingKey === suggestion.key}
              editText={editText}
              setEditText={setEditText}
              startEdit={() => {
                setEditingKey(suggestion.key);
                setEditText(suggestion.state.customText ?? suggestion.defaultText);
              }}
              cancelEdit={() => setEditingKey(null)}
              saveEdit={() =>
                update.mutate({ key: suggestion.key, patch: { customText: editText } })
              }
              onStatus={(status) => action(suggestion.key, status)}
            />
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>Rotina planejada</h2>
        {evolution.routine.length ? (
          <ul className="routine">
            {evolution.routine.map((item) => (
              <li key={item.key}>
                <span>
                  {item.title}{' '}
                  <span className="chip">{getInstrument(item.instrument)?.shortName}</span>
                </span>
                <span className="muted">
                  {item.duration} · {item.frequency}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Aceite sugestões de qualquer teste para montar a rotina da semana deste paciente.
          </p>
        )}
      </div>
    </div>
  );
}
