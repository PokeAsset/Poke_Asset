import React, { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { Btn, Empty, Loading, PageHead, Panel, Screen, SearchBox, Segmented, Select } from '../ui';
import { EBAY_DISCLOSURE, EbayItem, epnLink, searchEbay } from '../server';
import { formatMoney } from '../api';

const SORTS: Record<string, string> = {
  'Best match': 'best',
  'Price: low to high': 'price-low',
  'Price: high to low': 'price-high',
  'Newest': 'newest',
};

const money = (n: number | null, cur: string | null) => (n == null ? 'See eBay' : cur && cur !== 'USD' ? `${n.toFixed(2)} ${cur}` : formatMoney(n));

function Photo({ uri, style }: { uri: string | null; style: object }) {
  const [bad, setBad] = useState(false);
  return uri && !bad ? (
    <Image source={{ uri }} style={style} resizeMode="contain" onError={() => setBad(true)} />
  ) : (
    <View style={[style, { backgroundColor: colors.tintSlot }]} />
  );
}

/** Pokémon listings from eBay. Tap one to see its photo and price, with a link at the bottom to the real listing on eBay. */
export default function EbayListings() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('Cards');
  const [sort, setSort] = useState('Best match');
  const [items, setItems] = useState<EbayItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<EbayItem | null>(null);

  const run = async (nextSort = sort, nextKind = kind) => {
    if (!q.trim()) return;
    setBusy(true);
    setError('');
    setPicked(null);
    try {
      const r = await searchEbay(q.trim(), SORTS[nextSort], nextKind === 'Cards' ? 'cards' : 'all');
      setItems(r.items);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load eBay listings.');
      setItems(null);
    } finally {
      setBusy(false);
    }
  };

  if (picked) {
    return (
      <Screen>
        <View style={{ alignSelf: 'flex-start' }}>
          <Btn icon="arrow-back" label="Back to results" onPress={() => setPicked(null)} />
        </View>
        <Panel style={{ gap: 14 }}>
          <Photo uri={picked.image} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md }} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 27 }}>{picked.title}</Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>{money(picked.price, picked.currency)}</Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            {[
              picked.condition,
              picked.shipping != null ? (picked.shipping === 0 ? 'Free shipping' : `+ ${formatMoney(picked.shipping)} shipping`) : null,
              picked.buyingOptions.includes('AUCTION') ? 'Auction' : picked.buyingOptions.includes('FIXED_PRICE') ? 'Buy It Now' : null,
              picked.seller ? `Seller: ${picked.seller}${picked.sellerFeedback ? ` (${picked.sellerFeedback}% positive)` : ''}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Btn kind="gold" icon="open-outline" label="View this listing on eBay" onPress={() => Linking.openURL(epnLink(picked.url, 'pokeasset-listing')).catch(() => {})} />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            This is eBay's listing, not a PokéAsset sale. You buy on eBay; PokéAsset does not handle payment. Price and availability can change, so check the eBay page. {EBAY_DISCLOSURE}
          </Text>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHead eyebrow="Marketplace" title="eBay listings" text="Pokémon listings from eBay. Tap one to see its photo and price, then open the real listing on eBay." />
      <SearchBox value={q} onChangeText={setQ} placeholder="e.g. Charizard ex, Elite Trainer Box…" />
      <Segmented options={['Cards', 'All Pokémon']} value={kind} onChange={(v) => { setKind(v); if (items) run(sort, v); }} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 170 }}>
          <Select value={sort} options={Object.keys(SORTS)} onChange={(v) => { setSort(v); if (items) run(v); }} />
        </View>
        <Btn kind="gold" icon="search" label={busy ? 'Searching…' : 'Search eBay'} disabled={busy || !q.trim()} onPress={() => run()} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{EBAY_DISCLOSURE}</Text>
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {!busy && items && items.length === 0 ? <Empty icon="search-outline" text="No eBay listings found. Try different words." /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' }}>
        {(items ?? []).map((it) => (
          <Pressable key={it.id} onPress={() => setPicked(it)} style={{ width: '48.5%', gap: 6 }}>
            <Photo uri={it.image} style={{ width: '100%', aspectRatio: 1, borderRadius: 10 }} />
            <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>{it.title}</Text>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{money(it.price, it.currency)}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
