import React from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from './theme';
import { Btn, Loading, Panel } from './ui';
import { useAuth } from './auth';
import { MarketListing, MarketOrder } from './market';

/** Shows its children only when accounts are set up and the person is signed in; otherwise says what to do. */
export function Gate({ children, what }: { children: React.ReactNode; what: string }) {
  const auth = useAuth();
  const nav = useNavigation<any>();
  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'off') {
    return (
      <Panel style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Accounts are not set up yet</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          {what} needs accounts. The site owner adds SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and runs supabase/setup.sql and supabase/marketplace.sql (steps are in the README).
        </Text>
      </Panel>
    );
  }
  if (auth.status === 'out') {
    return (
      <Panel style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Sign in to continue</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>{what} is tied to your account.</Text>
        <View style={{ alignSelf: 'flex-start' }}>
          <Btn kind="gold" icon="log-in-outline" label="Sign in or create account" onPress={() => nav.navigate('Account')} />
        </View>
      </Panel>
    );
  }
  return <>{children}</>;
}

const toneOf = (status: string): string | undefined => ({
  available: colors.green,
  reserved: colors.amber,
  sold: colors.muted,
  removed: colors.red,
  requested: colors.amber,
  accepted: colors.green,
  declined: colors.red,
  shipped: colors.amber,
  completed: colors.green,
  cancelled: colors.muted,
} as Record<string, string>)[status];

export function StatusPill({ status }: { status: string }) {
  const c = toneOf(status) ?? colors.muted;
  return (
    <View style={{ borderWidth: 1, borderColor: c, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: c, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        maxLength={maxLength}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 16,
          backgroundColor: colors.card,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function Thumb({ l, size = 64 }: { l: Pick<MarketListing, 'photo_urls' | 'image_url'>; size?: number }) {
  const uri = l.photo_urls?.[0] ?? l.image_url;
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size * 1.2, borderRadius: 8, backgroundColor: colors.tintBlue }} resizeMode="cover" />
  ) : (
    <View style={{ width: size, height: size * 1.2, borderRadius: 8, backgroundColor: colors.tintBlue, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="image-outline" size={24} color={colors.muted} />
    </View>
  );
}

export const when = (s: string) => new Date(s).toLocaleString();
export const dollars = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export function OrderBadge({ o }: { o: MarketOrder }) {
  const ext = o.source === 'external';
  return (
    <View style={{ borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: ext ? colors.tintBlue : colors.tintGold, alignSelf: 'flex-start' }}>
      <Text style={{ color: ext ? colors.muted : colors.gold, fontSize: 12, fontWeight: '700' }}>
        {ext ? `Bought outside PokéAsset${o.platform ? ` · ${o.platform}` : ''}` : 'PokéAsset request · no payment taken'}
      </Text>
    </View>
  );
}
