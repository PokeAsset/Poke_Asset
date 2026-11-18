import React, { useEffect, useState } from 'react';
import { Alert, Platform, Text, TextInput, View } from 'react-native';
import { colors, mono, radius } from '../theme';
import { Btn, Body, Eyebrow, Loading, PageHead, PhotoSlot, Panel, Screen, SearchBox, usePhoto } from '../ui';
import { formatMoney, formatSigned, marketPrice } from '../api';
import { fetchGraded, gradePhotos, GradeRead } from '../server';
import { GradePrices, normalizeOdds, worthGrading } from '../gradeMath';
import { useStore } from '../store';
import { Card } from '../types';
import { useCardSearch } from './Home';

const inputStyle = () => ({
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.pill,
  paddingHorizontal: 16,
  paddingVertical: 12,
  color: colors.text,
  fontSize: 16,
  flex: 1,
});

const toNum = (s: string): number | null => {
  const t = s.trim().replace(/^\$/, '');
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) || n < 0 ? null : n;
};

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ color: colors.muted, width: 120 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="$"
        placeholderTextColor={colors.muted}
        style={inputStyle()}
      />
    </View>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Grade({ route }: any) {
  const { extras, setExtras } = useStore();
  const front = usePhoto();
  const back = usePhoto();
  const closeups = [usePhoto(), usePhoto(), usePhoto()];
  const ready = !!front.photo && !!back.photo;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [read, setRead] = useState<GradeRead | null>(null);

  const search = useCardSearch();
  const [card, setCard] = useState<Card | null>(route?.params?.card ?? null);
  const [prices, setPrices] = useState({ raw: '', p10: '', p9: '', p8: '', p7: '' });
  const [cost, setCost] = useState('30');
  const [fee, setFee] = useState('13');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [showResult, setShowResult] = useState(false);

  // fill the price boxes from whatever is stored for the chosen card
  useEffect(() => {
    if (!card) return;
    const v = extras[card.id]?.values ?? {};
    const p = (k: string) => (v[k] ? String(v[k].price) : '');
    const raw = marketPrice(card);
    setPrices((old) => ({
      raw: raw != null ? String(raw) : old.raw,
      p10: p('PSA 10') || old.p10,
      p9: p('PSA 9') || old.p9,
      p8: p('PSA 8') || old.p8,
      p7: p('PSA 7') || old.p7,
    }));
  }, [card, extras]);

  const pick = (p: ReturnType<typeof usePhoto>) => () =>
    Platform.OS === 'web'
      ? p.choose()
      : Alert.alert('Add photo', undefined, [
          { text: 'Take photo', onPress: p.shoot },
          { text: 'Choose from library', onPress: p.choose },
          { text: 'Cancel', style: 'cancel' },
        ]);

  const run = async () => {
    if (!front.photo || !back.photo) return;
    setBusy(true);
    setError('');
    setRead(null);
    setShowResult(false);
    try {
      const photos = [front.photo, back.photo, ...closeups.map((c) => c.photo).filter((x): x is NonNullable<typeof x> => !!x)];
      setRead(await gradePhotos(photos));
    } catch (e: any) {
      setError(e?.message ?? 'Grade estimate failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const lookup = async () => {
    if (!card) return;
    setFetching(true);
    setFetchMsg('');
    try {
      const got = await fetchGraded(card);
      if (got) {
        setExtras(card.id, got);
        setFetchMsg(Object.keys(got.values).length ? 'Graded prices filled in from recent eBay sales.' : 'No graded sales found; type prices in yourself.');
      } else {
        setFetchMsg('The price service has no match for this card; type prices in yourself.');
      }
    } catch (e: any) {
      setFetchMsg(e?.notConfigured ? 'Graded price lookup is off until the price key is added on the server. Type prices in yourself.' : e?.message ?? 'Lookup failed.');
    } finally {
      setFetching(false);
    }
  };

  const odds = normalizeOdds(read?.psaProbabilities);
  const gp: GradePrices = {
    raw: toNum(prices.raw),
    psa10: toNum(prices.p10),
    psa9: toNum(prices.p9),
    psa8: toNum(prices.p8),
    psa7: toNum(prices.p7),
  };
  const result = odds && showResult ? worthGrading({ prices: gp, odds, gradingCost: toNum(cost) ?? 0, sellFeePct: toNum(fee) ?? 0 }) : null;

  const verdictText = { worth: 'Worth grading', marginal: 'Marginal — small expected gain', not: 'Not worth grading' };
  const verdictColor = (v: 'worth' | 'marginal' | 'not') => (v === 'worth' ? colors.green : v === 'marginal' ? colors.amber : colors.red);

  const sub = (label: string, note?: string, score?: number) => (
    <View key={label} style={{ gap: 2 }}>
      <Text style={{ color: colors.text, fontSize: 16 }}>
        {label}
        {score != null ? ` · ${score}/10` : ''}
      </Text>
      {note ? <Text style={{ color: colors.muted, lineHeight: 20 }}>{note}</Text> : null}
    </View>
  );

  return (
    <Screen>
      <PageHead
        eyebrow="PokéGrade AI"
        title="Estimate a grade before you submit"
        text="Upload the front and back of one card. The AI describes centering, corners, edges and surface, gives odds for each PSA grade, and then tells you if grading it is likely to make money."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Panel style={{ flex: 1, padding: 14 }}>
          <PhotoSlot label="FRONT" uri={front.uri} onPress={pick(front)} />
        </Panel>
        <Panel style={{ flex: 1, padding: 14 }}>
          <PhotoSlot label="BACK" uri={back.uri} onPress={pick(back)} />
        </Panel>
      </View>
      <Panel style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Eyebrow>Close-ups (optional)</Eyebrow>
          <Text
            style={{ color: colors.gold, fontSize: 17, fontWeight: '600' }}
            onPress={() => {
              const next = closeups.find((c) => !c.uri);
              if (next) pick(next)();
            }}
          >
            Add
          </Text>
        </View>
        <Body style={{ fontSize: 16 }}>Angled or macro shots of corners, edges and the holo surface improve the read considerably.</Body>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {closeups.map((c, i) =>
            c.uri ? (
              <View key={i} style={{ flex: 1, height: 90 }}>
                <PhotoSlot uri={c.uri} onPress={c.clear} />
              </View>
            ) : null,
          )}
        </View>
      </Panel>
      {front.error || back.error ? <Text style={{ color: colors.red }}>{front.error || back.error}</Text> : null}
      <Btn
        kind="gold"
        label={busy ? 'Reading the photos…' : ready ? 'Estimate grade' : 'Add front and back to continue'}
        disabled={busy}
        onPress={ready ? run : undefined}
      />
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}

      {read ? (
        <Panel style={{ gap: 12 }}>
          <Eyebrow>Estimate</Eyebrow>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>
            PSA {read.psaLow ?? '?'}
            {read.psaHigh && read.psaHigh !== read.psaLow ? `–${read.psaHigh}` : ''}
          </Text>
          {read.confidence != null ? <Text style={{ color: colors.muted }}>Confidence {pct(read.confidence)}</Text> : null}
          {read.summary ? <Text style={{ color: colors.text, lineHeight: 22 }}>{read.summary}</Text> : null}
          {sub('Centering', [read.centering?.front && `front ${read.centering.front}`, read.centering?.back && `back ${read.centering.back}`, read.centering?.note].filter(Boolean).join(' · '))}
          {sub('Corners', read.corners?.note, read.corners?.score)}
          {sub('Edges', read.edges?.note, read.edges?.score)}
          {sub('Surface', read.surface?.note, read.surface?.score)}
          {odds ? (
            <Text style={{ color: colors.muted }}>
              Odds: PSA 10 {pct(odds.g10)} · PSA 9 {pct(odds.g9)} · PSA 8 {pct(odds.g8)} · PSA 7 {pct(odds.g7)} · lower {pct(odds.low)}
            </Text>
          ) : null}
          {read.cannotJudge?.length ? (
            <Text style={{ color: colors.muted, lineHeight: 20 }}>Photos cannot show: {read.cannotJudge.join(', ')}.</Text>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            This is an AI estimate from photos, not a PSA decision. Treat the odds as rough.
          </Text>
        </Panel>
      ) : null}

      {read && odds ? (
        <Panel style={{ gap: 12 }}>
          <Eyebrow>Is it worth grading?</Eyebrow>
          {card ? (
            <Text style={{ color: colors.text, fontSize: 17 }}>
              {card.name} · {card.set.name} #{card.number}
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}>Pick the card so we can use its prices.</Text>
          )}
          <SearchBox value={search.text} onChangeText={search.setText} placeholder={card ? 'Change card' : 'Search the card'} />
          {search.results.slice(0, 4).map((c) => (
            <Text
              key={c.id}
              style={{ color: colors.text, paddingVertical: 6 }}
              onPress={() => {
                setCard(c);
                search.setText('');
                setShowResult(false);
              }}
            >
              {c.name} · {c.set.name} #{c.number}
            </Text>
          ))}
          <Btn label={fetching ? 'Looking up…' : 'Fetch graded prices'} icon="cloud-download-outline" disabled={!card || fetching} onPress={lookup} />
          {fetchMsg ? <Text style={{ color: colors.muted, lineHeight: 20 }}>{fetchMsg}</Text> : null}
          <Field label="Raw price" value={prices.raw} onChange={(v) => setPrices({ ...prices, raw: v })} />
          <Field label="PSA 10 price" value={prices.p10} onChange={(v) => setPrices({ ...prices, p10: v })} />
          <Field label="PSA 9 price" value={prices.p9} onChange={(v) => setPrices({ ...prices, p9: v })} />
          <Field label="PSA 8 price" value={prices.p8} onChange={(v) => setPrices({ ...prices, p8: v })} />
          <Field label="PSA 7 price" value={prices.p7} onChange={(v) => setPrices({ ...prices, p7: v })} />
          <Field label="Grading cost" value={cost} onChange={setCost} />
          <Field label="Selling fee %" value={fee} onChange={setFee} />
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Grading cost = PSA fee + shipping + insurance. PSA changes its fees by service level, so check psacard.com and edit it. A grade with no price is counted at the raw price.
          </Text>
          <Btn kind="gold" icon="calculator-outline" label="Is it worth grading?" onPress={() => setShowResult(true)} />
        </Panel>
      ) : null}

      {result ? (
        <Panel style={{ gap: 10 }} border={result.ok ? verdictColor(result.verdict) : colors.border}>
          {!result.ok ? (
            <Text style={{ color: colors.red, lineHeight: 22 }}>{result.reason}</Text>
          ) : (
            <>
              <Text style={{ color: verdictColor(result.verdict), fontSize: 24, fontWeight: '800' }}>{verdictText[result.verdict]}</Text>
              <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>
                Selling raw nets about {formatMoney(result.rawNet)}. Grading and selling is expected to net about{' '}
                {formatMoney(result.gradedNet)}. Expected difference:{' '}
                <Text style={{ fontFamily: mono, fontWeight: '700' }}>
                  {formatSigned(result.gain)}
                  {result.gainPct != null ? ` (${result.gainPct >= 0 ? '+' : ''}${result.gainPct.toFixed(0)}%)` : ''}
                </Text>
              </Text>
              {result.rows.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>
                    {r.label} · {pct(r.odds)}
                  </Text>
                  <Text style={{ color: colors.text, fontFamily: mono }}>
                    {formatMoney(r.price)}
                    {r.assumed ? ' (raw)' : ''}
                  </Text>
                </View>
              ))}
              {result.breakEven10 != null ? (
                <Text style={{ color: colors.muted, lineHeight: 20 }}>
                  Grading breaks even if the chance of a PSA 10 is about {pct(result.breakEven10)} (the photo estimate says {pct(odds!.g10)}).
                </Text>
              ) : null}
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                Expected value uses the AI’s rough odds and recent sale prices. It is a guide, not a guarantee or financial advice.
              </Text>
            </>
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}




