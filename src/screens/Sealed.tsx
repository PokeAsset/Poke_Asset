import React, { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Chip, Loading, PageHead, Screen, SearchBox } from '../ui';
import { formatDate, SetInfo } from '../api';
import { EBAY_DISCLOSURE, loadSealed, searchSealed, SealedItem } from '../server';
import { SetBrowser } from '../setUi';
import { SealedProducts } from '../sealedUi';

const QUICK = ['Booster Box', 'Elite Trainer Box', 'Booster Bundle', 'Ultra Premium Collection', 'Tin', 'Build & Battle'];

/**
 * Sealed products catalog. Browse by era and set (logos, like the card sets page), or search by product name.
 */
export default function Sealed() {
  const nav = useNavigation<any>();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SealedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const searching = q.trim().length >= 2;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!searching) {
      setItems([]);
      setError('');
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setItems(await searchSealed(q.trim()));
        setError('');
      } catch (e: any) {
        setItems([]);
        setError(e?.message ?? 'Search failed');
      } finally {
        setBusy(false);
      }
    }, 450);
  }, [q]);

  return (
    <Screen>
      <PageHead
        eyebrow="Catalog"
        title="Sealed products"
        text="Booster boxes, Elite Trainer Boxes, bundles, tins and collections, organized by era and set. Pick a set, or search by name."
      />
      <SearchBox value={q} onChangeText={setQ} placeholder="Search a set or product (e.g. 151, Booster Box)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {QUICK.map((t) => (
          <Chip key={t} label={t} onPress={() => setQ(t)} />
        ))}
      </View>

      {/* sets that match what you typed (or every era when the box is empty) */}
      <SetBrowser mode="sealed" query={q} onOpen={(s) => nav.navigate('SealedSet', { set: s })} />

      {searching ? (
        <>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Products matching “{q.trim()}”</Text>
          {busy ? <Loading /> : null}
          {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
          {!busy && !error ? <SealedProducts items={items} empty="No sealed products match that search." /> : null}
        </>
      ) : null}
    </Screen>
  );
}

/** One set's sealed products, grouped by kind. Opened from the sealed catalog. */
export function SealedSet({ route }: any) {
  const set: SetInfo = route.params.set;
  const [items, setItems] = useState<SealedItem[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = async (force: boolean) => {
    force ? setRefreshing(true) : setBusy(true);
    setError('');
    try {
      let r = await loadSealed('', set.name, force);
      if (r.items.length === 0) r = await loadSealed(set.name, undefined, force);
      setItems(r.items);
      setFetchedAt(r.fetchedAt);
      setWarnings(r.warnings);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load sealed products.');
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, [set.name]);

  const priced = (items ?? []).filter((p) => p.market != null).length;

  return (
    <Screen>
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 8 }}>
        {set.images?.logo ? <Image source={{ uri: set.images.logo }} style={{ width: 190, height: 70 }} resizeMode="contain" /> : null}
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{set.name}</Text>
        <Text style={{ color: colors.muted }}>
          {set.series} · {formatDate(set.releaseDate)} · sealed products
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Btn icon="refresh-outline" label={refreshing ? 'Refreshing…' : 'Refresh prices'} disabled={refreshing || busy} onPress={() => load(true)} />
        <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>
          {fetchedAt ? `Checked ${new Date(fetchedAt).toLocaleString()} · ${priced} of ${items?.length ?? 0} have a price` : ''}
        </Text>
      </View>
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {warnings.map((w) => (
        <Text key={w} style={{ color: colors.amber, fontSize: 13 }}>
          Partial result: {w}
        </Text>
      ))}
      {!busy && !error ? (
        <SealedProducts
          items={items ?? []}
          setName={set.name}
          empty="No sealed products were found for this set. Try the search box on the Sealed products page."
        />
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        Market = the price the service reports for the product. Low = the lowest listing it reports. The chart under a product (tap its name) is recorded price history. Prices refresh about once a day at the source; pressing Refresh asks again now. If a product shows no price, use “Check on TCGplayer” to look it up there. {EBAY_DISCLOSURE}
      </Text>
    </Screen>
  );
}
