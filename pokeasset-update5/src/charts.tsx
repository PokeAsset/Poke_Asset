import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { colors, mono } from './theme';
import { formatMoney, formatPct, formatSigned } from './api';
import { Snapshot } from './types';

export type LineSeries = { label: string; points: { date: string; price: number }[] };

const RANGES: { label: string; days: number }[] = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: 0 },
];

const DAY = 86400000;
const toTime = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).getTime();
const longDate = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Robinhood-style market chart: big price, change for the chosen range, green when up and red when down,
 * range buttons, and drag a finger (or the mouse) along the line to read the price on any day.
 * Only real readings are drawn. With fewer than two readings it says so instead of inventing a line.
 */
export function MarketChart({
  series,
  note,
  height = 200,
}: {
  series: LineSeries[];
  note?: string;
  height?: number;
}) {
  const usable = series.filter((s) => s.points.length >= 2);
  const [pick, setPick] = useState(0);
  const [range, setRange] = useState('ALL');
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const widthRef = useRef(0);
  widthRef.current = w;
  const countRef = useRef(0);

  const cur = usable[Math.min(pick, Math.max(usable.length - 1, 0))];
  const pts = useMemo(() => {
    if (!cur) return [];
    const sorted = [...cur.points].sort((a, b) => a.date.localeCompare(b.date));
    const r = RANGES.find((x) => x.label === range);
    if (!r || r.days === 0) return sorted;
    const last = toTime(sorted[sorted.length - 1].date);
    return sorted.filter((p) => toTime(p.date) >= last - r.days * DAY);
  }, [cur, range]);
  countRef.current = pts.length;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => at(e.nativeEvent.locationX),
        onPanResponderMove: (e) => at(e.nativeEvent.locationX),
        onPanResponderRelease: () => setHover(null),
        onPanResponderTerminate: () => setHover(null),
      }),
    [],
  );
  function at(x: number) {
    const n = countRef.current;
    if (n < 2 || widthRef.current <= 0) return;
    // snap to the nearest reading by time position
    setHover(Math.max(0, Math.min(1, x / widthRef.current)));
  }

  if (usable.length === 0) {
    return (
      <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22 }}>
        {note ??
          'No price history yet. Each time this card’s price is refreshed a point is saved on this device, so the graph fills in over time.'}
      </Text>
    );
  }

  const times = pts.map((p) => toTime(p.date));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const span = t1 - t0 || 1;
  const prices = pts.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const toY = (p: number) => height - ((p - yMin) / (yMax - yMin)) * height;
  const xy = pts.map((p, i) => ({ x: ((times[i] - t0) / span) * w, y: toY(p.price) }));

  // reading under the finger
  let hIdx: number | null = null;
  if (hover != null && pts.length >= 2) {
    const target = t0 + hover * span;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - target) < Math.abs(times[best] - target)) best = i;
    hIdx = best;
  }
  const shown = hIdx != null ? pts[hIdx] : pts[pts.length - 1];
  const first = pts[0];
  const change = shown.price - first.price;
  const pct = first.price > 0 ? (change / first.price) * 100 : null;
  const up = change >= 0;
  const tone = up ? colors.green : colors.red;

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', fontFamily: mono }}>{formatMoney(shown.price)}</Text>
        <Text style={{ color: tone, fontSize: 15, fontWeight: '600', marginTop: 2 }}>
          {up ? '▲' : '▼'} {formatSigned(change)} ({formatPct(pct)}){' '}
          <Text style={{ color: colors.muted, fontWeight: '400' }}>
            {hIdx != null ? longDate(times[hIdx]) : range === 'ALL' ? 'all time' : `past ${range}`}
          </Text>
        </Text>
      </View>

      {usable.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {usable.map((s, i) => (
            <Pressable
              key={s.label}
              onPress={() => setPick(i)}
              style={{
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderColor: i === pick ? colors.tintGoldBorder : colors.border,
                backgroundColor: i === pick ? colors.tintGold : 'transparent',
              }}
            >
              <Text style={{ color: i === pick ? colors.gold : colors.muted, fontWeight: '600' }}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View
        style={{ height, width: '100%' }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        {w > 0 && pts.length >= 2 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height }}>
            {/* dashed line at the starting price */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                width: w,
                top: toY(first.price),
                borderTopWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border,
              }}
            />
            {xy.slice(1).map((b, i) => {
              const a = xy[i];
              const len = Math.hypot(b.x - a.x, b.y - a.y) + 0.6;
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: (a.x + b.x) / 2 - len / 2,
                    top: (a.y + b.y) / 2 - 1.5,
                    width: len,
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: tone,
                    transform: [{ rotate: `${ang}rad` }],
                  }}
                />
              );
            })}
            {hIdx != null ? (
              <View
                style={{
                  position: 'absolute',
                  left: xy[hIdx].x - 0.5,
                  top: 0,
                  width: 1,
                  height,
                  backgroundColor: colors.muted,
                }}
              />
            ) : null}
            <View
              style={{
                position: 'absolute',
                left: (hIdx != null ? xy[hIdx].x : xy[xy.length - 1].x) - 6,
                top: (hIdx != null ? xy[hIdx].y : xy[xy.length - 1].y) - 6,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tone,
                borderWidth: 2,
                borderColor: colors.bg,
              }}
            />
          </View>
        ) : null}
        {pts.length < 2 ? (
          <Text style={{ color: colors.muted, paddingTop: height / 2 - 10, textAlign: 'center' }}>
            Not enough readings in this range.
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {RANGES.map((r) => {
          const on = r.label === range;
          return (
            <Pressable
              key={r.label}
              onPress={() => {
                setRange(r.label);
                setHover(null);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: on ? tone : 'transparent',
              }}
            >
              <Text style={{ color: on ? '#ffffff' : tone, fontWeight: '700', fontSize: 14 }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Low {formatMoney(lo)} · High {formatMoney(hi)} · {pts.length} readings · drag along the line to see each day
      </Text>
    </View>
  );
}

/** Card price history (raw and graded tabs). */
export function PriceChart({ series, note }: { series: LineSeries[]; note?: string }) {
  return <MarketChart series={series} note={note} />;
}

/** Portfolio value over time, one reading per day the app refreshed prices. */
export function ValueChart({ snapshots }: { snapshots: Snapshot[] }) {
  return (
    <MarketChart
      series={[{ label: 'Portfolio value', points: snapshots.map((s) => ({ date: s.date, price: s.value })) }]}
      note="History builds up as you open the app on different days. Today's value is saved; come back tomorrow to see the first change."
    />
  );
}
