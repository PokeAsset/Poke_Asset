import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';
import { useStore } from './store';

type Item = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** [route, params] */
  go: [string, object?];
};

const tab = (screen: string): [string, object] => ['Tabs', { screen }];
const stub = (title: string, eyebrow: string): [string, object] => ['Placeholder', { title, eyebrow }];

export const MENU: { section: string; items: Item[] }[] = [
  {
    section: 'Catalog',
    items: [
      { label: 'Card database', icon: 'search-outline', go: ['CardDatabase'] },
      { label: 'Sets & checklists', icon: 'layers-outline', go: stub('Sets & checklists', 'Catalog') },
      { label: 'Sealed products', icon: 'cube-outline', go: stub('Sealed products', 'Catalog') },
      { label: 'Sealed market', icon: 'stats-chart-outline', go: stub('Sealed market', 'Catalog') },
    ],
  },
  {
    section: 'My portfolio',
    items: [
      { label: 'My collection', icon: 'library-outline', go: tab('Collection') },
      { label: 'My cards', icon: 'layers-outline', go: tab('Collection') },
      { label: 'Wishlist', icon: 'heart-outline', go: ['Wishlist'] },
      { label: 'Trade analyzer', icon: 'scale-outline', go: ['Trade'] },
    ],
  },
  {
    section: 'Community',
    items: [
      { label: 'Marketplace', icon: 'people-outline', go: tab('Marketplace') },
      { label: 'Messages', icon: 'chatbox-outline', go: stub('Messages', 'Community') },
      { label: 'My sale staging', icon: 'storefront-outline', go: stub('My sale staging', 'Community') },
      { label: 'Live shop', icon: 'pricetag-outline', go: stub('Live shop', 'Community') },
      { label: 'Store', icon: 'storefront-outline', go: stub('Store', 'Community') },
      { label: 'My orders', icon: 'receipt-outline', go: stub('My orders', 'Community') },
    ],
  },
  {
    section: 'Business',
    items: [
      { label: 'Business dashboard', icon: 'bar-chart-outline', go: stub('Business dashboard', 'Business') },
      { label: 'Suppliers', icon: 'cube-outline', go: stub('Suppliers', 'Business') },
      { label: 'Marketplace ops', icon: 'trending-up-outline', go: stub('Marketplace ops', 'Business') },
      { label: 'Graded prices', icon: 'analytics-outline', go: stub('Graded prices', 'Business') },
      { label: 'Moderation', icon: 'shield-checkmark-outline', go: stub('Moderation', 'Business') },
      { label: 'Data health', icon: 'server-outline', go: stub('Data health', 'Business') },
    ],
  },
];

export default function MenuDrawer({ navigation }: { navigation: any }) {
  const { menuOpen, setMenuOpen } = useStore();
  const insets = useSafeAreaInsets();
  const close = () => setMenuOpen(false);

  return (
    <Modal transparent animationType="fade" visible={menuOpen} onRequestClose={close}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} onPress={close} />
        <View style={[d.drawer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          <View style={d.top}>
            <Text style={d.menuLabel}>MENU</Text>
            <Pressable style={d.close} onPress={close}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10 }}>
            {MENU.map((g) => (
              <View key={g.section} style={{ marginBottom: 14 }}>
                <Text style={d.section}>{g.section.toUpperCase()}</Text>
                {g.items.map((it) => (
                  <Pressable
                    key={it.label}
                    style={d.item}
                    onPress={() => {
                      close();
                      navigation.navigate(it.go[0], it.go[1]);
                    }}
                  >
                    <Ionicons name={it.icon} size={24} color={colors.muted} />
                    <Text style={d.itemText}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={d.tip}>
            <Ionicons name="search-outline" size={16} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 15 }}>Tip: search works from any page</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const d = StyleSheet.create({
  drawer: { width: '70%', backgroundColor: colors.card, borderLeftWidth: 1, borderLeftColor: colors.border },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLabel: { color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 14 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 14, marginVertical: 12, marginLeft: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingVertical: 15, borderRadius: 16 },
  itemText: { color: colors.muted, fontSize: 20, fontWeight: '500' },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
