import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Body, Chip, Loading, Panel, Screen, SearchBox } from '../ui';
import { featuredCards, searchCards } from '../api';
import { Card } from '../types';
import { useStore } from '../store';
import { CardRow, CardTile } from './CardDetail';

export function useCardSearch() {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) {
      setResults([]);
      setError('');
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await searchCards(text));
        setError('');
      } catch (e: any) {
        setError(e.message ?? 'Search failed');
      } finally {
        setBusy(false);
      }
    }, 350);
  }, [text]);
  return { text, setText, results, busy, error };
}

export default function Home() {
  const nav = useNavigation<any>();
  const { recent } = useStore();
  const search = useCardSearch();
  const [featured, setFeatured] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    featuredCards()
      .then(setFeatured)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const open = (card: Card) => nav.navigate('CardDetail', { card });

  const tool = (
    title: string,
    sub: string,
    icon: keyof typeof Ionicons.glyphMap,
    go: () => void,
    hot?: boolean,
  ) => (
    <Pressable key={title} onPress={go} style={[h.tool, hot && { borderColor: '#6b5320' }]}>
      <View style={h.toolIcon}>
        <Ionicons name={icon} size={24} color={colors.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={h.toolTitle}>{title}</Text>
        <Text style={h.toolSub}>{sub}</Text>
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <Panel style={{ padding: 22, gap: 16, borderRadius: radius.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={h.badge}>
            <Ionicons name="sparkles-outline" size={16} color={colors.amber} />
            <Text style={h.badgeText}>CARD TERMINAL</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Catalog synced from pokemontcg.io</Text>
        </View>
        <Text style={h.hero}>Start your vault.</Text>
        <Body>
          Search the full Pokémon TCG catalog, add what you own, and watch set completion and profit
          build themselves.
        </Body>
        <SearchBox
          large
          value={search.text}
          onChangeText={search.setText}
          placeholder="Search a card, set, or number"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Try:</Text>
          {['Charizard', 'Base Set', '151', 'Umbreon'].map((t) => (
            <Chip key={t} label={t} onPress={() => search.setText(t)} />
          ))}
        </View>
      </Panel>

      {search.text.trim() ? (
        <Panel>
          {search.busy ? <Loading /> : null}
          {search.error ? <Text style={{ color: colors.red }}>{search.error}</Text> : null}
          {!search.busy && !search.error && search.results.length === 0 ? (
            <Text style={{ color: colors.muted }}>No cards match that search.</Text>
          ) : null}
          {search.results.map((c) => (
            <CardRow key={c.id} card={c} onPress={() => open(c)} />
          ))}
        </Panel>
      ) : (
        <>
          <View style={h.grid}>
            {tool('AI Assistant', 'Deals, collection, history', 'sparkles-outline', () =>
              nav.navigate('Tabs', { screen: 'Assistant' }),
            )}
            {tool('Scan a card', 'Camera or photo', 'scan-outline', () =>
              nav.navigate('Tabs', { screen: 'Scan' }), true,
            )}
            {tool('Sealed scanner', 'Identify packaging', 'barcode-outline', () =>
              nav.navigate('SealedScan'),
            )}
            {tool('PokéGrade AI', 'Estimate a grade', 'speedometer-outline', () =>
              nav.navigate('Grade'),
            )}
            {tool('Price research', 'Highest market estimates', 'trending-up-outline', () =>
              nav.navigate('Market'),
            )}
            {tool('Trade analyzer', 'Compare both sides', 'scale-outline', () =>
              nav.navigate('Trade'),
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={h.sectionTitle}>Most valuable in the catalog</Text>
              <Text style={{ color: colors.muted, fontSize: 16, marginTop: 4 }}>
                Market estimates from TCGplayer data
              </Text>
            </View>
            <Pressable onPress={() => nav.navigate('Market')}>
              <Text style={{ color: colors.gold, fontSize: 18 }}>Explore →</Text>
            </Pressable>
          </View>
          {loading ? <Loading /> : null}
          <View style={h.cards}>
            {featured.map((c) => (
              <CardTile key={c.id} card={c} onPress={() => open(c)} />
            ))}
          </View>

          <Panel style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={h.sectionTitle}>Recent activity</Text>
              <Ionicons name="flame-outline" size={26} color={colors.amber} />
            </View>
            {recent.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 17 }}>Nothing recorded yet.</Text>
            ) : (
              recent.slice(0, 6).map((t, i) => (
                <Text key={i} style={{ color: colors.text, fontSize: 16 }}>
                  • {t}
                </Text>
              ))
            )}
          </Panel>
        </>
      )}
    </Screen>
  );
}

const h = StyleSheet.create({
  hero: { color: colors.text, fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#6b5320',
    backgroundColor: '#1a1608',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  badgeText: { color: colors.amber, fontWeight: '700', letterSpacing: 3, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tool: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toolIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1a1608',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  toolSub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
