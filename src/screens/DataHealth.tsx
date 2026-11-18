import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { Btn, PageHead, Panel, Screen } from '../ui';
import { Diagnostics, runDiagnostics, TestResult } from '../server';

const ROWS: { id: keyof Diagnostics['tests']; label: string; fix: string }[] = [
  { id: 'gemini', label: 'Gemini assistant', fix: 'Vercel → Settings → Environment Variables: check GEMINI_API_KEY (and GEMINI_MODEL), then Redeploy.' },
  { id: 'prices', label: 'Sealed and graded prices', fix: 'Vercel: check PRICE_API_KEY is the full key from your pokemonpricetracker.com account, then Redeploy.' },
  { id: 'catalog', label: 'Card catalog (pokemontcg.io)', fix: 'Usually temporary. Optionally add POKEMONTCG_API_KEY (free at dev.pokemontcg.io) in Vercel.' },
  { id: 'accounts', label: 'Accounts and marketplace (Supabase)', fix: 'Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, and run supabase/setup.sql and supabase/marketplace.sql.' },
];

function Row({ label, r, fix }: { label: string; r: TestResult; fix: string }) {
  return (
    <View style={{ gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={r.ok ? 'checkmark-circle' : 'close-circle'} size={22} color={r.ok ? colors.green : colors.red} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{label}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{r.ms} ms</Text>
      </View>
      <Text style={{ color: r.ok ? colors.text : colors.red, lineHeight: 21 }}>{r.message}</Text>
      {!r.ok ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>How to fix: {fix}</Text> : null}
    </View>
  );
}

/** Menu → Data health. One tap tests every outside service the app depends on. */
export default function DataHealth() {
  const [d, setD] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setD(await runDiagnostics());
    } catch (e: any) {
      setError(e?.message ?? 'The test could not run.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHead
        eyebrow="Business"
        title="Data health"
        text="Tests each outside service with one small live request and shows exactly what it answered. No keys are ever shown."
      />
      <View style={{ alignSelf: 'flex-start' }}>
        <Btn kind="gold" icon="pulse-outline" label={busy ? 'Testing…' : d ? 'Test again' : 'Run connection tests'} disabled={busy} onPress={run} />
      </View>
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
      {d ? (
        <Panel>
          {ROWS.map((r) => (
            <Row key={r.id} label={r.label} r={d.tests[r.id]} fix={r.fix} />
          ))}
          <Text style={{ color: colors.muted, fontSize: 13, paddingTop: 8 }}>Assistant model in use: {d.model}</Text>
        </Panel>
      ) : null}
    </Screen>
  );
}
