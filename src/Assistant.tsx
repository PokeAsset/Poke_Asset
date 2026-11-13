import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Btn, Body, PageHead, Panel, Screen, SearchBox } from '../ui';
import { ChatMessage } from '../types';
import { formatMoney, marketPrice } from '../api';
import { useStore } from '../store';
import { useCardSearch } from './Home';

const GROUPS: { title: string; prompts: string[] }[] = [
  { title: 'DATA CHECK', prompts: ['How many dated readings do I actually have?'] },
  {
    title: 'LEARNING',
    prompts: [
      'Explain the difference between an estimate, an asking price and a sold price',
      'How does PSA grading affect liquidity?',
      'What should I check before buying a sealed booster box?',
    ],
  },
];

export default function Assistant() {
  const { owned, alerts } = useStore();
  const search = useCardSearch();
  const [attached, setAttached] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  /**
   * LOCAL STUB. Replace `answer` with a call to your backend / LLM.
   * Keep the "never guess a price" rule: only quote stored readings.
   */
  const answer = (q: string): string => {
    const lower = q.toLowerCase();
    if (lower.includes('dated readings')) {
      const dated = owned.filter((e) => e.card.tcgplayer?.updatedAt).length;
      return `${dated} of your ${owned.length} recorded copies have a dated market reading.`;
    }
    if (lower.includes('collection') || lower.includes('worth')) {
      const total = owned.reduce((n, e) => n + (marketPrice(e.card) ?? 0) * e.qty, 0);
      return `Stored market estimates put your collection at ${formatMoney(total)}, across ${owned.length} entries. ${alerts.length} alerts are active.`;
    }
    return 'The live assistant needs a backend connected (see src/screens/Assistant.tsx). Until then I can answer questions about your stored collection and readings.';
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    const id = String(Date.now());
    setMsgs((m) => [
      ...m,
      { id, role: 'user', text },
      { id: id + 'a', role: 'assistant', text: answer(text) },
    ]);
    setInput('');
  };

  return (
    <Screen>
      <PageHead
        eyebrow="PokéAsset AI"
        title="One assistant, every question"
        text="Deal checks, your collection, recorded market history and general collecting questions — in a single conversation that remembers what you already asked."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn label="History" icon="time-outline" />
        <Btn label="New" icon="chatbox-ellipses-outline" kind="gold" onPress={() => setMsgs([])} />
      </View>
      <SearchBox
        value={search.text}
        onChangeText={search.setText}
        placeholder="Attach a card to the conversation (optional)"
      />
      {search.results.slice(0, 4).map((c) => (
        <Pressable
          key={c.id}
          onPress={() => {
            setAttached(c.name);
            search.setText('');
          }}
        >
          <Text style={{ color: colors.text, paddingVertical: 6 }}>
            {c.name} · {c.set.name} #{c.number}
          </Text>
        </Pressable>
      ))}
      {attached ? <Text style={{ color: colors.gold }}>Attached: {attached}</Text> : null}

      <Panel style={{ gap: 14, borderRadius: radius.lg }}>
        {msgs.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              backgroundColor: m.role === 'user' ? '#2a2210' : '#141a24',
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
          </View>
        ))}
        {msgs.length === 0
          ? GROUPS.map((g) => (
              <View
                key={g.title}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, gap: 14 }}
              >
                <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>
                  {g.title}
                </Text>
                {g.prompts.map((p) => (
                  <Pressable key={p} onPress={() => send(p)}>
                    <Text style={{ color: colors.muted, fontSize: 17, lineHeight: 24 }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            ))
          : null}
        {msgs.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#4a3c14',
              backgroundColor: '#17130a',
              borderRadius: 18,
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>
              NEED EXACT DETAIL FIRST?
            </Text>
            <Body style={{ fontSize: 16, lineHeight: 23 }}>
              The scanners feed this assistant: scan a card or a sealed product, run PokéGrade, then ask
              about what came back.
            </Body>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => send(input)}
            style={{
              flex: 1,
              color: colors.text,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.pill,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
            }}
          />
          <Pressable
            onPress={() => send(input)}
            style={{ backgroundColor: colors.gold, borderRadius: 24, padding: 12 }}
          >
            <Ionicons name="arrow-up" size={20} color="#1a1405" />
          </Pressable>
        </View>
      </Panel>
    </Screen>
  );
}
