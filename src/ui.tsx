import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors, mono, radius, titleGradient, themed } from './theme';
import { useStore } from './store';
import { useThemeMode } from './themeMode';

/** Message box that also works in the browser (Alert.alert does nothing on web). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/* ---------- gradient title (per-character colour interpolation) ---------- */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(t: number): string {
  const g = titleGradient();
  const seg = t * (g.length - 1);
  const i = Math.min(Math.floor(seg), g.length - 2);
  const f = seg - i;
  const a = hex(g[i]);
  const b = hex(g[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}

export function GradientTitle({ children, size = 44 }: { children: string; size?: number }) {
  const chars = children.split('');
  return (
    <Text style={{ fontSize: size, fontWeight: '800', lineHeight: size * 1.18, letterSpacing: -1 }}>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: mix(i / Math.max(chars.length - 1, 1)) }}>
          {c}
        </Text>
      ))}
    </Text>
  );
}

/* ---------- text helpers ---------- */

export const Eyebrow = ({ children }: { children: string }) => (
  <Text style={s.eyebrow}>{children.toUpperCase()}</Text>
);
export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <Text style={[s.body, style]}>{children}</Text>
);

/* ---------- containers ---------- */

export function Panel({
  children,
  style,
  border,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  border?: string;
}) {
  return <View style={[s.panel, border ? { borderColor: border } : null, style]}>{children}</View>;
}

export function Btn({
  label,
  icon,
  onPress,
  kind = 'ghost',
  disabled,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  kind?: 'gold' | 'ghost';
  disabled?: boolean;
}) {
  const gold = kind === 'gold';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[s.btn, gold ? s.btnGold : s.btnGhost, disabled && { opacity: 0.5 }]}
    >
      {icon ? <Ionicons name={icon} size={18} color={gold ? '#1a1405' : colors.text} /> : null}
      <Text style={[s.btnText, { color: gold ? '#1a1405' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: colors.gold }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={[s.segItem, value === o && s.segActive]}
        >
          <Text style={[s.segText, value === o && { color: colors.gold }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  large,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  large?: boolean;
}) {
  return (
    <View style={[s.search, large && { paddingVertical: 6 }]}>
      <Ionicons name="search-outline" size={20} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={s.searchInput}
        autoCorrect={false}
      />
    </View>
  );
}

export function Empty({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title?: string;
  text: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.amber} />
      </View>
      {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export const Loading = () => (
  <View style={{ padding: 24 }}>
    <ActivityIndicator color={colors.amber} />
  </View>
);

/* ---------- picker modal (used for era / rarity selects) ---------- */

export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={s.select} onPress={() => setOpen(true)}>
        <Text style={s.selectText}>{value}</Text>
        <Ionicons name="chevron-expand" size={20} color={colors.text} />
      </Pressable>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <ScrollView>
              {options.map((o) => (
                <Pressable
                  key={o}
                  style={s.sheetRow}
                  onPress={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                >
                  <Text style={[s.sheetText, o === value && { color: colors.gold }]}>{o}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ---------- photo picker slot ---------- */

export type PhotoData = { uri: string; base64: string; mime: string };

function toPhoto(asset: ImagePicker.ImagePickerAsset): PhotoData | null {
  let b64 = asset.base64 ?? '';
  let mime = asset.mimeType ?? 'image/jpeg';
  if (!b64 && asset.uri.startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(asset.uri);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
  }
  return b64 ? { uri: asset.uri, base64: b64, mime } : null;
}

/** Photo from the camera or library. base64 is kept so the photo can be sent to the vision service. */
export function usePhoto() {
  const [photo, setPhoto] = useState<PhotoData | null>(null);
  const [error, setError] = useState('');
  const take = (r: ImagePicker.ImagePickerResult) => {
    if (r.canceled) return;
    const p = toPhoto(r.assets[0]);
    if (p) {
      setPhoto(p);
      setError('');
    } else {
      setError('That photo could not be read. Try another one.');
    }
  };
  const choose = async () => {
    try {
      take(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true }));
    } catch {
      setError('Could not open the photo library.');
    }
  };
  const shoot = async () => {
    try {
      if (Platform.OS === 'web') return choose();
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('Camera permission is off. Turn it on in Settings, or choose a photo.');
      take(await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true }));
    } catch {
      setError('Could not open the camera.');
    }
  };
  return { uri: photo?.uri ?? null, photo, error, choose, shoot, clear: () => setPhoto(null) };
}

export function PhotoSlot({
  label,
  uri,
  onPress,
}: {
  label?: string;
  uri: string | null;
  onPress: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      {label ? <Text style={s.slotLabel}>{label}</Text> : null}
      <Pressable style={s.slot} onPress={onPress}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <>
            <Ionicons name="image-outline" size={26} color={colors.muted} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>Add photo</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

/* ---------- screen shell with the PokéAsset header ---------- */

export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { setMenuOpen } = useStore();
  const theme = useThemeMode();
  const icon = (name: keyof typeof Ionicons.glyphMap, onPress: () => void, hot?: boolean) => (
    <Pressable onPress={onPress} style={[s.hIcon, hot && s.hIconHot]}>
      <Ionicons name={name} size={22} color={hot ? colors.amber : colors.text} />
    </Pressable>
  );
  const Body = scroll ? ScrollView : View;
  const { width } = useWindowDimensions();
  const narrow = width < 520;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, width: '100%', overflow: 'hidden' }}>
      <View style={[s.header, narrow && { paddingHorizontal: 12, paddingVertical: 10 }]}>
        <Pressable style={[s.logoRow, { flexShrink: 1, minWidth: 0 }]} onPress={() => nav.navigate('Tabs', { screen: 'Home' })}>
          <Image source={require('../assets/logo.png')} style={{ width: narrow ? 34 : 40, height: narrow ? 34 : 40, borderRadius: 9 }} />
          <Text style={[s.brand, narrow && { fontSize: 18 }]} numberOfLines={1}>
            PokéAsset
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: narrow ? 6 : 10, flexShrink: 0 }}>
          {!narrow ? icon('notifications-outline', () => nav.navigate('Tabs', { screen: 'Alerts' })) : null}
          {!narrow ? icon('sparkles-outline', () => nav.navigate('Tabs', { screen: 'Assistant' })) : null}
          {icon('scan-outline', () => nav.navigate('Tabs', { screen: 'Scan' }), true)}
          {icon(theme.mode === 'dark' ? 'sunny-outline' : 'moon-outline', theme.toggle)}
          {icon('menu-outline', () => setMenuOpen(true))}
        </View>
      </View>
      <Body
        style={{ flex: 1, width: '100%' }}
        {...(scroll
          ? {
              contentContainerStyle: {
                padding: narrow ? 14 : 20,
                paddingBottom: 40,
                gap: 16,
                width: '100%',
                maxWidth: 960,
                alignSelf: 'center' as const,
              },
              keyboardShouldPersistTaps: 'handled' as const,
            }
          : {})}
      >
        {children}
      </Body>
    </View>
  );
}

export function PageHead({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <GradientTitle>{title}</GradientTitle>
      {text ? <Body>{text}</Body> : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8d24a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBand: { position: 'absolute', height: 5, left: 0, right: 0, backgroundColor: '#1a1a1a' },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f8d24a',
    borderWidth: 3,
    borderColor: '#1a1a1a',
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: '700' },
  hIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hIconHot: { borderColor: colors.tintGoldBorder, backgroundColor: colors.tintGold },
  eyebrow: { color: colors.muted, fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 17, lineHeight: 26 },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: radius.pill,
  },
  btnGold: { backgroundColor: colors.gold },
  btnGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnText: { fontSize: 16, fontWeight: '600' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.tintGoldBorder, backgroundColor: colors.tintGold },
  chipText: { color: colors.text, fontSize: 15 },
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 5,
    backgroundColor: colors.card,
  },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  segActive: { backgroundColor: colors.tintBlue },
  segText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 12 },
  empty: { alignItems: 'center', padding: 28, gap: 10 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tintIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  selectText: { color: colors.text, fontSize: 18 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '70%',
  },
  sheetRow: { padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetText: { color: colors.text, fontSize: 17 },
  slotLabel: { color: colors.muted, fontSize: 13, letterSpacing: 3, fontWeight: '700', marginBottom: 10 },
  slot: {
    height: 300,
    borderRadius: radius.md,
    backgroundColor: colors.tintSlot,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));

export const money = { fontFamily: mono, color: colors.text, fontWeight: '700' as const };
