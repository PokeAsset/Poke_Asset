import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Empty, PageHead, Panel, Screen } from '../ui';
import { formatMoney, marketPrice } from '../api';
import { useStore } from '../store';
import { CardRow } from './CardDetail';

export default function Wishlist() {
  const nav = useNavigation<any>();
  const { wishlist, removeWishlist, updateWishlist, refreshPrices, refreshing } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const save = (key: string) => {
    if (draft.trim() === '') {
      updateWishlist(key, undefined);
    } else {
      const n = Number(draft);
      if (isNaN(n) || n <= 0) return setErr('Enter a price like 25.00, or leave it empty.');
      updateWishlist(key, n);
    }
    setErr('');
    setEditing(null);
  };

  return (
    <Screen>
      <PageHead
        eyebrow="My portfolio"
        title="Wishlist"
        text="Cards you want. Set a target price and see how far the stored market price is from it."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn label={refreshing ? 'Refreshing…' : 'Refresh prices'} icon="refresh" disabled={refreshing} onPress={() => refreshPrices()} />
        <Btn kind="gold" label="Add cards" icon="add" onPress={() => nav.navigate('CardDatabase')} />
      </View>
      <Panel>
        {wishlist.length === 0 ? (
          <Empty icon="heart-outline" text="Open any card and tap “Add to wishlist” to save it here." />
        ) : (
          wishlist.map((w) => {
            const p = marketPrice(w.card);
            const reached = w.target != null && p != null && p <= w.target;
            return (
              <View key={w.key} style={{ paddingBottom: 10 }}>
                <CardRow
                  card={w.card}
                  onPress={() => nav.navigate('CardDetail', { card: w.card })}
                  right={
                    <Pressable onPress={() => removeWishlist(w.key)}>
                      <Ionicons name="close" size={20} color={colors.muted} />
                    </Pressable>
                  }
                />
                {editing === w.key ? (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      keyboardType="decimal-pad"
                      placeholder="Target price ($)"
                      placeholderTextColor={colors.muted}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: radius.pill,
                        paddingHorizontal: 18,
                        paddingVertical: 12,
                        color: colors.text,
                        fontSize: 16,
                      }}
                    />
                    {err ? <Text style={{ color: colors.red }}>{err}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn kind="gold" label="Save" onPress={() => save(w.key)} />
                      <Btn label="Cancel" onPress={() => { setEditing(null); setErr(''); }} />
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setDraft(w.target != null ? String(w.target) : '');
                      setErr('');
                      setEditing(w.key);
                    }}
                  >
                    <Text style={{ color: reached ? colors.amber : colors.muted, marginTop: 6 }}>
                      {w.target == null
                        ? 'Tap to set a target price'
                        : p == null
                        ? `Target ${formatMoney(w.target)} · no current price`
                        : reached
                        ? `Target ${formatMoney(w.target)} reached — now ${formatMoney(p)}`
                        : `Target ${formatMoney(w.target)} · ${formatMoney(p - w.target)} above it`}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </Panel>
    </Screen>
  );
}
