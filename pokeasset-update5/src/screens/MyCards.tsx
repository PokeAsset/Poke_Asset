import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, mono, radius } from '../theme';
import { Btn, Empty, PageHead, Panel, Screen, SearchBox, Segmented, Select } from '../ui';
import { formatDate, formatMoney, formatPct, formatSigned, variantList } from '../api';
import { searchSealed } from '../server';
import { useStore } from '../store';
import { combinedTotals, entryPnl, entryValue, realizedProfit, setProgress } from '../portfolio';
import { ValueChart } from '../charts';
import EntryForm from '../EntryForm';
import { OwnedEntry, SealedEntry } from '../types';
import { CardRow } from './CardDetail';

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Panel style={{ width: '48.5%', borderRadius: 24, minHeight: 130, padding: 18 }}>
      <Text style={{ color: colors.muted, letterSpacing: 2, fontWeight: '700', fontSize: 12 }}>{label}</Text>
      <Text
        style={{ color: tone ?? colors.text, fontSize: 28, fontFamily: mono, fontWeight: '800', marginTop: 10 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 14, marginTop: 6 }}>{sub}</Text> : null}
    </Panel>
  );
}

/** Record a sale: how many, and the price each. */
function SellBox({ max, onSell }: { max: number; onSell: (qty: number, price: number) => void }) {
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  } as const;
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
      <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>RECORD A SALE</Text>
      <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder={`How many (max ${max})`} placeholderTextColor={colors.muted} style={field} />
      <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Sold for, each ($)" placeholderTextColor={colors.muted} style={field} />
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      <Btn
        label="Record sale"
        icon="cash-outline"
        onPress={() => {
          const q = parseInt(qty, 10);
          const p = Number(price);
          if (isNaN(q) || q < 1 || q > max) return setErr(`Enter a number from 1 to ${max}.`);
          if (price.trim() === '' || isNaN(p) || p < 0) return setErr('Enter the sale price, like 25.00.');
          setErr('');
          onSell(q, p);
        }}
      />
    </View>
  );
}

function SealedEditor({
  item, onSave, onSell, onDelete, onClose,
}: {
  item: SealedEntry;
  onSave: (patch: Partial<SealedEntry>) => void;
  onSell: (q: number, p: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(String(item.qty));
  const [cost, setCost] = useState(String(item.cost));
  const [market, setMarket] = useState(item.market != null ? String(item.market) : '');
  const [err, setErr] = useState('');
  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  } as const;
  return (
    <>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{item.name}</Text>
      <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder="How many" placeholderTextColor={colors.muted} style={field} />
      <TextInput value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="Paid each ($)" placeholderTextColor={colors.muted} style={field} />
      <TextInput value={market} onChangeText={setMarket} keyboardType="decimal-pad" placeholder="Market value each ($, optional)" placeholderTextColor={colors.muted} style={field} />
      {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Btn
          kind="gold"
          label="Save changes"
          onPress={() => {
            const q = parseInt(qty, 10);
            const c = cost.trim() === '' ? 0 : Number(cost);
            const m = market.trim() === '' ? null : Number(market);
            if (isNaN(q) || q < 1) return setErr('How many must be 1 or more.');
            if (isNaN(c) || c < 0) return setErr('Paid each must be a number.');
            if (m != null && (isNaN(m) || m < 0)) return setErr('Market value must be a number.');
            onSave({ qty: q, cost: c, market: m });
          }}
        />
        <Btn label="Cancel" onPress={onClose} />
        <Btn label="Delete" icon="trash-outline" onPress={onDelete} />
      </View>
      <SellBox max={item.qty} onSell={onSell} />
    </>
  );
}

const SORTS = ['Newest', 'Value (high to low)', 'Profit (high to low)', 'Name (A–Z)'];

export default function MyCards() {
  const nav = useNavigation<any>();
  const {
    owned, updateOwned, removeOwned, snapshots, refreshPrices, refreshing, refreshError, lastRefreshed,
    sealed, sales, updateSealed, removeSealed, sellOwned, sellSealed, removeSale,
  } = useStore();
  const [sealedKey, setSealedKey] = useState<string | null>(null);
  const [sealedBusy, setSealedBusy] = useState(false);
  const [sealedMsg, setSealedMsg] = useState('');
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('All');
  const [sort, setSort] = useState(SORTS[0]);
  const [editKey, setEditKey] = useState<string | null>(null);

  const all = useMemo(() => combinedTotals(owned, sealed), [owned, sealed]);
  const totals = all.singles;
  const editingSealed = sealed.find((x) => x.key === sealedKey) ?? null;
  const realized = useMemo(() => realizedProfit(sales), [sales]);
  const sets = useMemo(() => setProgress(owned), [owned]);
  const editing = owned.find((e) => e.key === editKey) ?? null;

  const shown = useMemo(() => {
    const list = owned
      .filter((e) => seg === 'All' || (seg === 'Graded') === e.graded)
      .filter((e) => !q.trim() || e.card.name.toLowerCase().includes(q.trim().toLowerCase()));
    const val = (e: OwnedEntry) => (entryValue(e).perCopy ?? -1) * e.qty;
    const pnl = (e: OwnedEntry) => entryPnl(e).pnl ?? -Infinity;
    if (sort === SORTS[1]) list.sort((a, b) => val(b) - val(a));
    else if (sort === SORTS[2]) list.sort((a, b) => pnl(b) - pnl(a));
    else if (sort === SORTS[3]) list.sort((a, b) => a.card.name.localeCompare(b.card.name));
    return list;
  }, [owned, seg, q, sort]);

  const tone = all.pnl > 0 ? colors.amber : all.pnl < 0 ? colors.red : colors.text;

  const updateSealedPrices = async () => {
    setSealedBusy(true);
    setSealedMsg('');
    let done = 0;
    try {
      for (const s of sealed.slice(0, 10)) {
        const list = await searchSealed(s.name, s.setName ?? undefined);
        const hit = list.find((p) => (s.productId != null && p.id === s.productId) || p.name === s.name);
        if (hit && hit.market != null) {
          updateSealed(s.key, { market: hit.market, updatedAt: hit.updatedAt });
          done += 1;
        }
      }
      setSealedMsg(`Updated ${done} of ${Math.min(sealed.length, 10)} sealed prices.`);
    } catch (e: any) {
      setSealedMsg(e?.notConfigured ? 'Sealed prices are off until the price key is added on the server.' : e?.message ?? 'Update failed.');
    } finally {
      setSealedBusy(false);
    }
  };

  return (
    <Screen>
      <PageHead
        eyebrow="My collection"
        title="My cards"
        text="Every copy you have recorded, valued at the stored market price or your own value for graded cards."
      />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Btn
          label={refreshing ? 'Refreshing…' : 'Refresh prices'}
          icon="refresh"
          disabled={refreshing}
          onPress={() => refreshPrices()}
        />
        <Btn kind="gold" label="Add cards" onPress={() => nav.navigate('CardDatabase')} />
      </View>
      <Text style={{ color: refreshError ? colors.red : colors.muted }}>
        {refreshError
          ? `Last refresh failed: ${refreshError}`
          : lastRefreshed
          ? `Prices last refreshed ${formatDate(lastRefreshed)}`
          : 'Prices have not been refreshed yet.'}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat label="PORTFOLIO VALUE" value={formatMoney(all.value)} sub={all.unpriced ? `${all.unpriced} items have no price` : 'singles + sealed'} />
        <Stat label="TOTAL COST" value={formatMoney(all.cost)} />
        <Stat
          label="PROFIT / LOSS"
          value={all.pricedCost > 0 ? formatSigned(all.pnl) : '—'}
          sub={all.pnlPct != null ? formatPct(all.pnlPct) : 'needs a cost and a price'}
          tone={tone}
        />
        <Stat label="CARDS" value={String(totals.copies)} sub={`${totals.graded} graded · ${all.sealed.items} sealed`} />
      </View>

      <Panel style={{ gap: 12 }}>
        <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>VALUE HISTORY</Text>
        <ValueChart snapshots={snapshots} />
      </Panel>

      <SearchBox value={q} onChangeText={setQ} placeholder="Search your cards" />
      <Segmented options={['All', 'Raw', 'Graded']} value={seg} onChange={setSeg} />
      <Select value={sort} options={SORTS} onChange={setSort} />

      {shown.length === 0 ? (
        <Empty
          icon="albums-outline"
          text={owned.length === 0 ? 'Nothing here yet. Add cards from the catalog.' : 'No cards match this filter.'}
        />
      ) : (
        <Panel>
          {shown.map((e) => {
            const v = entryValue(e);
            const p = entryPnl(e);
            return (
              <View key={e.key} style={{ paddingBottom: 8 }}>
                <CardRow
                  card={e.card}
                  onPress={() => nav.navigate('CardDetail', { card: e.card })}
                  right={null}
                />
                <Pressable onPress={() => setEditKey(e.key)} style={{ gap: 4 }}>
                  <Text style={{ color: colors.text }}>
                    {e.qty} × {e.graded ? `${e.company ?? ''} ${e.grade ?? ''}`.trim() : e.condition ?? 'Raw'}
                    {e.variant ? ` · ${variantList(e.card).find((v) => v.key === e.variant)?.label ?? e.variant}` : ''} · cost{' '}
                    {formatMoney(e.cost)} each
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Value {v.perCopy == null ? '—' : formatMoney(v.perCopy * e.qty)}
                    {v.basis === 'declared' ? ' (your value)' : ''}
                    {p.pnl != null ? ` · ${formatSigned(p.pnl)} (${formatPct(p.pct)})` : ''}
                  </Text>
                  <Text style={{ color: colors.amber }}>Edit</Text>
                </Pressable>
              </View>
            );
          })}
        </Panel>
      )}

      <Panel style={{ gap: 12 }}>
        <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>SEALED PRODUCTS</Text>
        {sealed.length === 0 ? (
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            No sealed products yet. Open a set from Sets & checklists, switch to Sealed and tap + Add.
          </Text>
        ) : (
          <>
            {sealed.map((x) => {
              const pnl = x.market != null ? (x.market - x.cost) * x.qty : null;
              return (
                <Pressable key={x.key} onPress={() => setSealedKey(x.key)} style={{ gap: 3, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: 16 }}>
                    {x.qty} × {x.name}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    {x.setName ?? ''} · cost {formatMoney(x.cost)} each · market {formatMoney(x.market)}
                    {x.updatedAt ? ` (${formatDate(x.updatedAt)})` : ''}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Value {x.market != null ? formatMoney(x.market * x.qty) : '—'}
                    {pnl != null ? ` · ${formatSigned(pnl)}` : ''} · <Text style={{ color: colors.amber }}>Edit</Text>
                  </Text>
                </Pressable>
              );
            })}
            <Btn label={sealedBusy ? 'Updating…' : 'Update sealed prices'} icon="refresh" disabled={sealedBusy} onPress={updateSealedPrices} />
            {sealedMsg ? <Text style={{ color: colors.muted }}>{sealedMsg}</Text> : null}
          </>
        )}
      </Panel>

      <Panel style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>SALES</Text>
        {sales.length === 0 ? (
          <Text style={{ color: colors.muted, lineHeight: 22 }}>Open a card or sealed product and tap Edit to record a sale. Realized profit shows up here.</Text>
        ) : (
          <>
            <Text style={{ color: realized >= 0 ? colors.amber : colors.red, fontSize: 22, fontWeight: '800' }}>
              Realized {formatSigned(realized)}
            </Text>
            {sales.slice(0, 10).map((x) => (
              <View key={x.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ color: colors.text, flex: 1 }}>
                  {x.date} · {x.qty} × {x.name} at {formatMoney(x.price)}
                </Text>
                <Text style={{ color: (x.price - x.cost) * x.qty >= 0 ? colors.amber : colors.red }}>
                  {formatSigned((x.price - x.cost) * x.qty)}
                </Text>
                <Pressable onPress={() => removeSale(x.key)}>
                  <Text style={{ color: colors.muted }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </Panel>

      <Panel style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>SET COMPLETION</Text>
        {sets.length === 0 ? (
          <Text style={{ color: colors.muted }}>Sets you collect from will show up here.</Text>
        ) : (
          sets.map((st) => {
            const pct = st.total ? Math.min(100, (st.owned / st.total) * 100) : 0;
            return (
              <View key={st.setId} style={{ gap: 6 }}>
                <Text style={{ color: colors.text }}>
                  {st.name} · {st.owned}
                  {st.total ? ` / ${st.total}` : ''}
                </Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${pct}%`, backgroundColor: colors.amber }} />
                </View>
              </View>
            );
          })
        )}
      </Panel>

      <Modal transparent animationType="fade" visible={!!editingSealed} onRequestClose={() => setSealedKey(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, maxHeight: '90%' }}>
            <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
              {editingSealed ? (
                <SealedEditor
                  item={editingSealed}
                  onSave={(patch) => {
                    updateSealed(editingSealed.key, patch);
                    setSealedKey(null);
                  }}
                  onSell={(q, p) => {
                    sellSealed(editingSealed.key, q, p);
                    setSealedKey(null);
                  }}
                  onDelete={() => {
                    removeSealed(editingSealed.key);
                    setSealedKey(null);
                  }}
                  onClose={() => setSealedKey(null)}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={!!editing} onRequestClose={() => setEditKey(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16 }}>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              maxHeight: '90%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
              {editing ? (
                <>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{editing.card.name}</Text>
                  <EntryForm
                    initial={editing}
                    submitLabel="Save changes"
                    onSubmit={(v) => {
                      updateOwned(editing.key, v);
                      setEditKey(null);
                    }}
                    variants={variantList(editing.card).filter((v) => v.market != null)}
                    onCancel={() => setEditKey(null)}
                    onDelete={() => {
                      removeOwned(editing.key);
                      setEditKey(null);
                    }}
                  />
                  <SellBox
                    max={editing.qty}
                    onSell={(q, p) => {
                      sellOwned(editing.key, q, p);
                      setEditKey(null);
                    }}
                  />
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
