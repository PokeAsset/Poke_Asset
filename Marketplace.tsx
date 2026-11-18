import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, mono, radius } from '../theme';
import { Btn, Chip, Empty, PageHead, Panel, Screen, SearchBox, Segmented, Select } from '../ui';
import { useStore } from '../store';
import { Listing } from '../types';

const FILTERS = ['All items', 'Cards', 'Sealed', 'PSA', 'CGC', 'Beckett (BGS)'];
const SORTS = ['Newest', 'Price: low to high', 'Price: high to low'];

export default function Marketplace() {
  const { listings, addListing, toggleSaved } = useStore();
  const [tab, setTab] = useState('Browse');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(FILTERS[0]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState(SORTS[0]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [kind, setKind] = useState<'Cards' | 'Sealed'>('Cards');

  const saved = listings.filter((l) => l.saved);
  const mine = listings.filter((l) => l.mine);
  const base = tab === 'Browse' ? listings : tab.startsWith('Saved') ? saved : mine;

  const shown = base
    .filter((l) => !q.trim() || l.title.toLowerCase().includes(q.toLowerCase()))
    .filter((l) => filter === 'All items' || l.kind === filter || l.tag === filter)
    .filter((l) => (!min || l.price >= +min) && (!max || l.price <= +max))
    .sort((a, b) =>
      sort === SORTS[1] ? a.price - b.price : sort === SORTS[2] ? b.price - a.price : 0,
    );

  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.card,
  } as const;

  return (
    <Screen>
      <PageHead
        eyebrow="Community marketplace"
        title="Buy and sell with other collectors"
        text="Member listings for cards and sealed product, with the asking price shown against recorded market evidence. PokéAsset does not process payments or hold funds — you arrange the sale directly and message through the app."
      />
      <View style={{ flexDirection: 'row' }}>
        <Btn kind="gold" label="Create listing" icon="add" onPress={() => setCreating(true)} />
      </View>
      <Segmented
        options={['Browse', `Saved (${saved.length})`, `My listings (${mine.length})`]}
        value={tab.startsWith('Saved') ? `Saved (${saved.length})` : tab.startsWith('My') ? `My listings (${mine.length})` : 'Browse'}
        onChange={setTab}
      />
      <SearchBox value={q} onChangeText={setQ} placeholder="Search by card, product, set or seller..." />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput style={[field, { flex: 1 }]} value={min} onChangeText={setMin} placeholder="Min $" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />
        <TextInput style={[field, { flex: 1 }]} value={max} onChangeText={setMax} placeholder="Max $" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />
      </View>
      <Select value={sort} options={SORTS} onChange={setSort} />

      {shown.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 24 }}>
          <Empty
            icon="car-outline"
            title="No listings yet"
            text="Be the first to list a card or sealed product."
          />
        </View>
      ) : (
        shown.map((l: Listing) => (
          <Panel key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{l.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {l.kind}
                {l.tag ? ` · ${l.tag}` : ''}
                {l.mine ? ' · yours' : ''}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontFamily: mono, fontWeight: '700', fontSize: 18 }}>
              ${l.price.toFixed(2)}
            </Text>
            <Pressable onPress={() => toggleSaved(l.key)}>
              <Ionicons name={l.saved ? 'heart' : 'heart-outline'} size={24} color={colors.amber} />
            </Pressable>
          </Panel>
        ))
      )}

      <Modal transparent animationType="slide" visible={creating} onRequestClose={() => setCreating(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, padding: 22, gap: 14, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>Create listing</Text>
            <TextInput style={field} value={title} onChangeText={setTitle} placeholder="Card or product name" placeholderTextColor={colors.muted} />
            <TextInput style={field} value={price} onChangeText={setPrice} placeholder="Asking price ($)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Chip label="Cards" active={kind === 'Cards'} onPress={() => setKind('Cards')} />
              <Chip label="Sealed" active={kind === 'Sealed'} onPress={() => setKind('Sealed')} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Cancel" onPress={() => setCreating(false)} />
              <Btn
                kind="gold"
                label="Publish"
                onPress={() => {
                  if (!title.trim() || !(parseFloat(price) > 0)) return;
                  addListing({ title: title.trim(), price: parseFloat(price), kind });
                  setTitle('');
                  setPrice('');
                  setCreating(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
