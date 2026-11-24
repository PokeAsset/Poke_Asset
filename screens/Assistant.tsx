import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Btn, Body, PageHead, Panel, Screen, SearchBox } from '../ui';
import { ChatMessage } from '../types';
import { formatDate, formatMoney, marketPrice } from '../api';
import { askAssistant, getStatus, KeyStatus } from '../server';
import { assistantContext } from '../portfolio';
import { Card } from '../types';
import { useStore } from '../store';
import { useCardSearch } from './Home';

const GROUPS: { title: string; prompts: string[] }[] = [
  {
    title: 'MY PORTFOLIO',
    prompts: [
      'How is my portfolio doing overall?',
      'Which of my cards are my top gainers, and should I hold or sell them?',
      'How much of my value is sealed versus singles?',
      'Help me track what I have spent and earned so far',
    ],
  },
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
  const { owned, alerts, wishlist, sealed, sales, recent } = useStore();
  const search = useCardSearch();
  const [attached, setAttached] = useState<Card | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<KeyStatus | null | 'error'>(null);
  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus('error'));
  }, []);

  /** Portfolio facts sent to the server as system instructions. Only stored numbers, each with its date. */
  const buildContext = (): string => {
    const extra: string[] = [];
    if (wishlist.length) extra.push(`WISHLIST: ${wishlist.slice(0, 15).map((w) => w.card.name).join(', ')}`);
    if (alerts.length) extra.push(`ALERTS: ${alerts.slice(0, 15).map((x) => `${x.card.name} ${x.direction} ${formatMoney(x.target)}`).join(', ')}`);
    if (attached) {
      extra.push(
        `ATTACHED CARD: ${attached.name} (${attached.set.name} #${attached.number}), stored market price ${formatMoney(marketPrice(attached))}` +
          `${attached.tcgplayer?.updatedAt ? `, dated ${formatDate(attached.tcgplayer.updatedAt)}` : ''}`,
      );
    }
    return assistantContext(owned, sealed, sales, recent, extra);
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const id = String(Date.now());
    const next: ChatMessage[] = [...msgs, { id, role: 'user', text: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const reply = await askAssistant(
        next.map((m) => ({ role: m.role, text: m.text })),
        buildContext(),
      );
      setMsgs((m) => [...m, { id: id + 'a', role: 'assistant', text: reply }]);
    } catch (e: any) {
      const why = e?.notConfigured
        ? 'The assistant is off until the Gemini key is added on the server (GEMINI_API_KEY).'
        : e?.message ?? 'Something went wrong. Try again.';
      setMsgs((m) => [...m, { id: id + 'a', role: 'assistant', text: why }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHead
        eyebrow="PokéAsset AI"
        title="One assistant, every question"
        text="Deal checks, your collection, recorded market history and general collecting questions — in a single conversation that remembers what you already asked."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn label="New" icon="chatbox-ellipses-outline" kind="gold" onPress={() => setMsgs([])} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        {status === null
          ? 'Checking connections…'
          : status === 'error'
          ? 'Could not reach the server functions. They may not be deployed yet, or the site needs a redeploy.'
          : `Gemini ${status.gemini ? '✓ connected' : '✗ key missing'} · Live prices ${status.prices ? '✓ connected' : '✗ key missing'}`}
      </Text>
      <SearchBox
        value={search.text}
        onChangeText={search.setText}
        placeholder="Attach a card to the conversation (optional)"
      />
      {search.results.slice(0, 4).map((c) => (
        <Pressable
          key={c.id}
          onPress={() => {
            setAttached(c);
            search.setText('');
          }}
        >
          <Text style={{ color: colors.text, paddingVertical: 6 }}>
            {c.name} · {c.set.name} #{c.number}
          </Text>
        </Pressable>
      ))}
      {attached ? <Text style={{ color: colors.gold }}>Attached: {attached.name} · {attached.set.name} #{attached.number}</Text> : null}

      <Panel style={{ gap: 14, borderRadius: radius.lg }}>
        {msgs.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              backgroundColor: m.role === 'user' ? colors.bubbleUser : colors.bubbleBot,
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
        {busy ? <Text style={{ color: colors.muted }}>Thinking…</Text> : null}
        {msgs.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.noteBorder,
              backgroundColor: colors.noteBg,
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





