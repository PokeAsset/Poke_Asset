import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, themed } from '../theme';
import { Btn, Loading, PageHead, Panel, Screen, Segmented } from '../ui';
import { useAuth } from '../auth';
import { CloudStatus, useCloud } from '../cloud';
import { useStore } from '../store';

const MODES = ['Sign in', 'Create account'];

const STATUS_TEXT: Record<CloudStatus, string> = {
  off: 'Accounts are not available right now.',
  signedOut: 'Signed out.',
  checking: 'Checking your saved portfolio…',
  conflict: 'Needs your choice (see below).',
  saving: 'Saving…',
  synced: 'Saved to your account.',
  error: 'Could not save to your account.',
};

function Field({
  label,
  value,
  onChangeText,
  secure,
  email,
  onSubmit,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secure?: boolean;
  email?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={a.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={email ? 'email-address' : 'default'}
        autoComplete={email ? 'email' : secure ? 'password' : 'off'}
        textContentType={email ? 'emailAddress' : secure ? 'password' : 'none'}
        onSubmitEditing={onSubmit}
        placeholderTextColor={colors.muted}
        style={a.input}
      />
    </View>
  );
}

function Note({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={ok ? colors.green : colors.red} style={{ marginTop: 2 }} />
      <Text style={{ color: ok ? colors.text : colors.red, flex: 1, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

/** Menu → Account. Sign in or create an account; signed-in portfolios are saved to the account. */
export default function Account() {
  const auth = useAuth();
  const cloud = useCloud();
  const store = useStore();
  const [mode, setMode] = useState(MODES[0]);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const creating = mode === MODES[1];

  const submit = async () => {
    if (busy) return;
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg({ ok: false, text: 'Enter a valid email address.' });
    if (!pw) return setMsg({ ok: false, text: 'Enter your password.' });
    if (creating && pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for the password.' });
    if (creating && pw !== pw2) return setMsg({ ok: false, text: 'The two passwords do not match.' });
    setBusy(true);
    const r = creating ? await auth.signUp(email, pw) : await auth.signIn(email, pw);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message ?? 'Something went wrong.' });
    setPw('');
    setPw2('');
    if (r.needsConfirm) {
      setMode(MODES[0]);
      setMsg({ ok: true, text: r.message ?? 'Check your email.' });
    }
  };

  const forgot = async () => {
    setMsg(null);
    setBusy(true);
    const r = await auth.resetPassword(email);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message ?? (r.ok ? 'Done.' : 'Something went wrong.') });
  };

  const savePassword = async () => {
    setMsg(null);
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for the new password.' });
    if (pw !== pw2) return setMsg({ ok: false, text: 'The two passwords do not match.' });
    setBusy(true);
    const r = await auth.setNewPassword(pw);
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message ?? (r.ok ? 'Done.' : 'Something went wrong.') });
    if (r.ok) {
      setPw('');
      setPw2('');
    }
  };

  const signOut = async (clear: boolean) => {
    if (clear && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    await auth.signOut();
    if (clear) store.loadData(null);
  };

  let body: React.ReactNode;
  if (auth.status === 'loading') {
    body = <Loading />;
  } else if (auth.status === 'off') {
    body = (
      <Panel style={{ gap: 10 }}>
        <Text style={a.h}>Accounts are not set up on this site yet</Text>
        <Text style={a.p}>
          Your collection is still saved on this device. To turn accounts on, the site owner adds two settings on the server
          (SUPABASE_URL and SUPABASE_ANON_KEY) and runs the one-time setup in the README.
        </Text>
      </Panel>
    );
  } else if (auth.recovering) {
    body = (
      <Panel style={{ gap: 14 }}>
        <Text style={a.h}>Choose a new password</Text>
        <Field label="New password" value={pw} onChangeText={setPw} secure />
        <Field label="Type it again" value={pw2} onChangeText={setPw2} secure onSubmit={savePassword} />
        {msg ? <Note ok={msg.ok} text={msg.text} /> : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Btn kind="gold" label={busy ? 'Saving…' : 'Save password'} disabled={busy} onPress={savePassword} />
        </View>
      </Panel>
    );
  } else if (auth.status === 'out') {
    body = (
      <Panel style={{ gap: 14 }}>
        <Segmented options={MODES} value={mode} onChange={(m) => { setMode(m); setMsg(null); }} />
        <Field label="Email" value={email} onChangeText={setEmail} email />
        <Field label="Password" value={pw} onChangeText={setPw} secure onSubmit={creating ? undefined : submit} />
        {creating ? <Field label="Type the password again" value={pw2} onChangeText={setPw2} secure onSubmit={submit} /> : null}
        {msg ? <Note ok={msg.ok} text={msg.text} /> : null}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn kind="gold" icon={creating ? 'person-add-outline' : 'log-in-outline'} label={busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'} disabled={busy} onPress={submit} />
          {!creating ? <Btn label="Forgot password?" disabled={busy} onPress={forgot} /> : null}
        </View>
        <Text style={a.small}>
          {creating
            ? 'Use at least 8 characters. We never see your password. It goes straight to the account service.'
            : 'No account yet? Pick “Create account” above. Without one, your collection stays on this device only.'}
        </Text>
      </Panel>
    );
  } else {
    const when = cloud.lastSynced ? new Date(cloud.lastSynced).toLocaleString() : null;
    body = (
      <>
        <Panel style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="person-circle-outline" size={32} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <Text style={a.h}>Signed in</Text>
              <Text style={{ color: colors.muted }} numberOfLines={1}>
                {auth.session?.email}
              </Text>
            </View>
          </View>
          <Text style={{ color: cloud.status === 'error' ? colors.red : colors.text }}>
            {STATUS_TEXT[cloud.status]}
            {cloud.status === 'synced' && when ? ` Last saved ${when}.` : ''}
          </Text>
          {cloud.error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{cloud.error}</Text> : null}
          <Text style={a.small}>
            Your collection, sealed products, wishlist, alerts, sales and price readings are saved to your account and load
            when you sign in on another device.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Btn icon="cloud-upload-outline" label="Save now" disabled={cloud.status === 'saving' || cloud.status === 'checking' || cloud.status === 'conflict'} onPress={cloud.syncNow} />
            <Btn icon="log-out-outline" label="Sign out" onPress={() => signOut(false)} />
          </View>
        </Panel>

        {cloud.conflict ? (
          <Panel border={colors.tintGoldBorder} style={{ gap: 12 }}>
            <Text style={a.h}>Two portfolios found</Text>
            <Text style={a.p}>
              Your account already has a saved portfolio ({cloud.conflict.items} cards and sealed items
              {cloud.conflict.savedAt ? `, saved ${new Date(cloud.conflict.savedAt).toLocaleString()}` : ''}), and this device has its own.
              Pick the one to keep. The other one is replaced.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <Btn kind="gold" label="Keep my account's portfolio" onPress={cloud.keepCloudCopy} />
              <Btn label="Keep this device's portfolio" onPress={cloud.keepThisDevice} />
            </View>
          </Panel>
        ) : null}

        <Panel style={{ gap: 10 }}>
          <Text style={a.h}>Shared device?</Text>
          <Text style={a.p}>
            Signing out keeps this device's copy of your collection. To remove it from this device as well (your account's copy
            stays safe), sign out and clear it.
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Btn label={confirmClear ? 'Tap again to confirm' : 'Sign out and clear this device'} onPress={() => signOut(true)} />
          </View>
        </Panel>
      </>
    );
  }

  return (
    <Screen>
      <PageHead
        eyebrow="Account"
        title="Your account"
        text="Sign in to keep your collection saved to your account and open it on any device."
      />
      {body}
    </Screen>
  );
}

const a = themed(() => StyleSheet.create({
  h: { color: colors.text, fontSize: 20, fontWeight: '700' },
  p: { color: colors.text, fontSize: 16, lineHeight: 24 },
  small: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 17,
    backgroundColor: colors.card,
  },
}));
