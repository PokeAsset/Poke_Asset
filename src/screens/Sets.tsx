import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Empty, Loading, PageHead, Panel, Screen, SearchBox, Select } from '../ui';
import { ebaySearchUrl } from '../server';
import { cardTcgplayerUrl, fetchSetCards, formatDate, formatMoney, marketPrice, SetInfo } from '../api';
import { SetBrowser } from '../setUi';
import { searchSealed, SealedItem } from '../server';
import { SealedProducts } from '../sealedUi';
import { Card } from '../types';
import { useStore } from '../store';

/* ---------- Sets page: era chips, search, grids of sets with logos ---------- */

export default function Sets() {
  const nav = useNavigation<any>();
  return (
    <Screen>
      <PageHead eyebrow="Browse" title="Card sets" text="Every English set, newest first. Pick an era, then a set to see its cards." />
      <SetBrowser mode="cards" showSearch onOpen={(s) => nav.navigate('SetDetail', { set: s })} />
    </Screen>
  );
}

/* ---------- one set: header, Cards / Sealed tabs, grid ---------- */

const PAGE = 48;

function Tab({ label, count, on, onPress }: { label: string; count?: number | null; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: on ? colors.amber : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: on ? colors.text : colors.muted, fontSize: 18, fontWeight: '700' }}>{label}</Text>
      {count != null ? (
        <View style={{ backgroundColor: colors.tintBlue, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SetDetail({ route }: any) {
  const nav = useNavigation<any>();
  const set: SetInfo = route.params.set;
  const { owned, addOwned } = useStore();
  const [tab, setTab] = useState<'cards' | 'sealed'>('cards');

  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [rarity, setRarity] = useState('All rarities');
  const [seg, setSeg] = useState('All cards');
  const [limit, setLimit] = useState(PAGE);
  const [addMode, setAddMode] = useState(false);
  const [notice, setNotice] = useState('');

  const [items, setItems] = useState<SealedItem[] | null>(null);
  const [sBusy, setSBusy] = useState(false);
  const [sError, setSError] = useState('');
  const [sort, setSort] = useState('Price: high to low');

  useEffect(() => {
    fetchSetCards(set.id)
      .then(setCards)
      .catch((e) => setError(e?.message ?? 'Could not load cards.'))
      .finally(() => setBusy(false));
  }, [set.id]);

  useEffect(() => {
    if (tab !== 'sealed' || items || sBusy) return;
    setSBusy(true);
    setSError('');
    (async () => {
      try {
        let list = await searchSealed('', set.name);
        if (list.length === 0) list = await searchSealed(set.name);
        setItems(list);
      } catch (e: any) {
        setSError(e?.message ?? 'Could not load sealed products.');
      } finally {
        setSBusy(false);
      }
    })();
  }, [tab]);

  useEffect(() => setLimit(PAGE), [q, rarity, seg, sort]);

  const count = useMemo(() => {
    const m = new Map<string, number>();
    owned.forEach((e) => m.set(e.card.id, (m.get(e.card.id) ?? 0) + e.qty));
    return m;
  }, [owned]);
  const rarities = useMemo(
    () => ['All rarities', ...Array.from(new Set(cards.map((c) => c.rarity).filter((r): r is string => !!r))).sort()],
    [cards],
  );
  const SORT_OPTIONS = ['Price: high to low', 'Price: low to high', 'Card number'];
  const filtered = cards
    .filter((c) => rarity === 'All rarities' || c.rarity === rarity)
    .filter((c) => seg === 'All cards' || (seg === 'Owned') === ((count.get(c.id) ?? 0) > 0))
    .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.number === q.trim())
    .sort((a, b) => {
      if (sort === 'Card number') return 0; // keep the order the set came in
      const pa = marketPrice(a);
      const pb = marketPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1; // cards without a price always go last
      if (pb == null) return -1;
      return sort === 'Price: low to high' ? pa - pb : pb - pa;
    });
  const shown = filtered.slice(0, limit);

  const ownedDistinct = cards.filter((c) => (count.get(c.id) ?? 0) > 0).length;
  const total = cards.length || set.total;
  const pct = total > 0 ? Math.round((ownedDistinct / total) * 100) : 0;
  const setValue = cards.reduce((n, c) => n + (marketPrice(c) ?? 0), 0);
  const best = useMemo(() => [...cards].sort((a, b) => (marketPrice(b) ?? 0) - (marketPrice(a) ?? 0))[0], [cards]);

  const quickAdd = (c: Card) => {
    addOwned({ card: c, qty: 1, cost: 0, graded: false, condition: 'Near Mint' });
    setNotice(`Added ${c.name}. Open My cards to set what you paid.`);
  };
  return (
    <Screen>
      {/* header card, like PokéData */}
      <View style={{ borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        {best ? (
          <Image
            source={{ uri: best.images.large }}
            style={{ position: 'absolute', top: -60, left: 0, width: '100%', aspectRatio: 0.716, opacity: 0.35 }}
            resizeMode="cover"
          />
        ) : null}
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              {set.images?.logo ? <Image source={{ uri: set.images.logo }} style={{ width: 170, height: 64 }} resizeMode="contain" /> : null}
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{set.name}</Text>
              <Text style={{ color: colors.text }}>{formatDate(set.releaseDate)}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 39,
                  borderWidth: 7,
                  borderColor: pct > 0 ? colors.amber : colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{pct}%</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 18, marginTop: 4 }}>
                <Text style={{ fontWeight: '800' }}>{ownedDistinct}</Text>/{total}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 6 }}>
            <Text style={{ color: colors.text }}>
              <Text style={{ fontWeight: '800' }}>SERIES </Text>
              {set.series}
            </Text>
            {set.ptcgoCode ? (
              <Text style={{ color: colors.text }}>
                <Text style={{ fontWeight: '800' }}>SYMBOL </Text>
                {set.ptcgoCode}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: colors.text }}>
            <Text style={{ fontWeight: '800' }}>TOTAL VALUE </Text>
            {busy ? '…' : formatMoney(setValue)}
            <Text style={{ color: colors.muted, fontSize: 12 }}>  one of each card, stored market prices</Text>
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Tab label="Cards" count={cards.length || null} on={tab === 'cards'} onPress={() => setTab('cards')} />
        <Tab label="Sealed Products" count={items ? items.length : null} on={tab === 'sealed'} onPress={() => setTab('sealed')} />
      </View>
      {notice ? <Text style={{ color: colors.amber }}>{notice}</Text> : null}

      {tab === 'cards' ? (
        <>
          <SearchBox value={q} onChangeText={setQ} placeholder="Find a card…" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Select value={rarity} options={rarities} onChange={setRarity} />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Select value={seg} options={['All cards', 'Owned', 'Missing']} onChange={setSeg} />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Select value={sort} options={SORT_OPTIONS} onChange={setSort} />
            </View>
          </View>
          <View style={{ alignSelf: 'flex-start' }}>
            <Btn
              kind="gold"
              icon={addMode ? 'checkmark' : 'add'}
              label={addMode ? 'Done adding' : 'Add to Portfolio'}
              onPress={() => setAddMode((v) => !v)}
            />
          </View>
          {addMode ? <Text style={{ color: colors.muted }}>Tap any card to add one copy to your portfolio.</Text> : null}
          {busy ? <Loading /> : null}
          {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
          {!busy && shown.length === 0 ? <Empty icon="albums-outline" text="No cards match." /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' }}>
            {shown.map((c) => {
              const n = count.get(c.id) ?? 0;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => (addMode ? quickAdd(c) : nav.navigate('CardDetail', { card: c }))}
                  style={{ width: '48.5%', gap: 6 }}
                >
                  <View>
                    <Image source={{ uri: c.images.small }} style={{ width: '100%', aspectRatio: 0.716, borderRadius: 10, backgroundColor: colors.tintSlot }} />
                    <Pressable
                      onPress={() => quickAdd(c)}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -6,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: n > 0 ? colors.amber : colors.tintBlue,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: n > 0 ? '#1a1405' : colors.text, fontSize: n > 0 ? 15 : 24, fontWeight: '800' }}>{n > 0 ? n : '+'}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
                    #{c.number} · {c.rarity ?? 'Card'}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{formatMoney(marketPrice(c))}</Text>
                  <Pressable onPress={() => Linking.openURL(cardTcgplayerUrl(c)).catch(() => {})}>
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>Check on TCGplayer ↗</Text>
                  </Pressable>
                  <Pressable onPress={() => Linking.openURL(ebaySearchUrl(`${c.name} ${(c.number ?? '').split('/')[0]}`)).catch(() => {})}>
                    <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>Search on eBay ↗</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
          {filtered.length > limit ? <Btn label={`Show more (${filtered.length - limit} left)`} onPress={() => setLimit((l) => l + PAGE)} /> : null}
        </>
      ) : (
        <>
          {sBusy ? <Loading /> : null}
          {sError ? <Text style={{ color: colors.red, lineHeight: 22 }}>{sError}</Text> : null}
          {!sBusy && !sError ? (
            <SealedProducts items={items ?? []} setName={set.name} empty="No sealed products found for this set. Try the Sealed products page and search by name." />
          ) : null}
        </>
      )}
    </Screen>
  );
}
