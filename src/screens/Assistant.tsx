import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Btn, Body, PageHead, Panel, Screen, SearchBox } from '../ui';
import { ChatMessage } from '../types';
import { formatDate, formatMoney, marketPrice } from '../api';
import { askAssistantStream, getStatus, KeyStatus } from '../server';
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

  const sending = useRef(false);
  const stop = useRef<AbortController | null>(null);
  const [live, setLive] = useState('');

  const send = async (text: string) => {
    const q = text.trim();
    // a ref (not state) so a double tap or Enter + click in the same instant cannot send twice
    if (!q || sending.current) return;
    sending.current = true;
    const id = String(Date.now());
    const history: ChatMessage[] = [...msgs, { id, role: 'user', text: q }];
    // the assistant's bubble is added now and filled in as the answer arrives
    setMsgs([...history, { id: id + 'a', role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    setLive('');
    const ctl = new AbortController();
    stop.current = ctl;
    let got = '';
    try {
      const lookups = await askAssistantStream(
        history.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text })),
        buildContext(),
        {
          onText: (d) => {
            got += d;
            setMsgs((m) => m.map((x) => (x.id === id + 'a' ? { ...x, text: got } : x)));
          },
          onStatus: setLive,
        },
        ctl.signal,
      );
      if (lookups.length) {
        got += `\n\nLive lookups used: ${lookups.join('; ')}`;
        setMsgs((m) => m.map((x) => (x.id === id + 'a' ? { ...x, text: got } : x)));
      }
    } catch (e: any) {
      const why = e?.notConfigured
        ? 'The assistant is off until the Gemini key is added on the server (GEMINI_API_KEY).'
        : e?.message ?? 'Something went wrong. Try again.';
      // keep whatever part of the answer already arrived, and say what went wrong
      setMsgs((m) => m.map((x) => (x.id === id + 'a' ? { ...x, text: got ? `${got}\n\n(Stopped: ${why})` : why, error: !got } : x)));
    } finally {
      sending.current = false;
      stop.current = null;
      setBusy(false);
      setLive('');
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
        <Btn label="New" icon="chatbox-ellipses-outline" kind="gold" disabled={busy} onPress={() => setMsgs([])} />
        {busy ? <Btn label="Stop" icon="stop-circle-outline" onPress={() => stop.current?.abort()} /> : null}
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
            {m.text ? (
              <Text selectable style={{ color: m.error ? colors.red : colors.text, fontSize: 16, lineHeight: 22 }}>{m.text}</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color={colors.amber} size="small" />
                <Text style={{ color: colors.muted }}>{live || 'Thinking…'}</Text>
              </View>
            )}
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
        {busy && live && msgs[msgs.length - 1]?.text ? <Text style={{ color: colors.muted }}>{live}</Text> : null}
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
            placeholder={busy ? 'Waiting for the answer…' : 'Ask a follow-up or anything'}
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
            disabled={busy}
            style={{ backgroundColor: colors.gold, borderRadius: 24, padding: 12, opacity: busy ? 0.5 : 1 }}
          >
            <Ionicons name="arrow-up" size={20} color="#1a1405" />
          </Pressable>
        </View>
      </Panel>
    </Screen>
  );
}
