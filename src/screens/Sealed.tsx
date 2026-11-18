import React, { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Chip, Loading, PageHead, Screen, SearchBox } from '../ui';
import { formatDate, SetInfo } from '../api';
import { searchSealed, SealedItem } from '../server';
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
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let list = await searchSealed('', set.name);
        if (list.length === 0) list = await searchSealed(set.name);
        if (live) setItems(list);
      } catch (e: any) {
        if (live) setError(e?.message ?? 'Could not load sealed products.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [set.name]);

  return (
    <Screen>
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, gap: 8 }}>
        {set.images?.logo ? <Image source={{ uri: set.images.logo }} style={{ width: 190, height: 70 }} resizeMode="contain" /> : null}
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{set.name}</Text>
        <Text style={{ color: colors.muted }}>
          {set.series} · {formatDate(set.releaseDate)} · sealed products
        </Text>
      </View>
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {!busy && !error ? (
        <SealedProducts
          items={items ?? []}
          setName={set.name}
          empty="No sealed products were found for this set. Try the search box on the Sealed products page."
        />
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        Prices are the market prices the price service reports. If a product shows no price, use “Check on TCGplayer” to look it up there.
      </Text>
    </Screen>
  );
}
