import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Empty, PageHead, Panel, Screen, SearchBox } from '../ui';
import { useStore } from '../store';
import { CardRow } from './CardDetail';
import { useCardSearch } from './Home';

/** Menu → Catalog → Card database. Also the target of "Add cards". */
export function CardDatabase() {
  const nav = useNavigation<any>();
  const s = useCardSearch();
  return (
    <Screen>
      <PageHead eyebrow="Catalog" title="Card database" text="Search every card synced from pokemontcg.io." />
      <SearchBox value={s.text} onChangeText={s.setText} placeholder="Search a card, set, or number" />
      {s.error ? <Text style={{ color: colors.red }}>{s.error}</Text> : null}
      <Panel>
        {s.results.length === 0 ? (
          <Empty icon="search-outline" text="Type to search the catalog." />
        ) : (
          s.results.map((c) => (
            <CardRow key={c.id} card={c} onPress={() => nav.navigate('CardDetail', { card: c })} />
          ))
        )}
      </Panel>
    </Screen>
  );
}

/** Wishlist = alerts that have a target. */
export function Wishlist() {
  const nav = useNavigation<any>();
  const { alerts } = useStore();
  return (
    <Screen>
      <PageHead eyebrow="My portfolio" title="Wishlist" text="Cards you are watching with a target price." />
      <Panel>
        {alerts.length === 0 ? (
          <Empty icon="heart-outline" text="Open any card and set a target price to add it here." />
        ) : (
          alerts.map((a) => (
            <CardRow key={a.key} card={a.card} onPress={() => nav.navigate('CardDetail', { card: a.card })} />
          ))
        )}
      </Panel>
    </Screen>
  );
}

/**
 * Pages in the menu that exist in the Base44 app but whose content was not
 * visible in the screenshots. Each is a stub to fill in.
 */
export function Placeholder({ route }: any) {
  const { title, eyebrow } = route.params as { title: string; eyebrow: string };
  return (
    <Screen>
      <PageHead eyebrow={eyebrow} title={title} />
      <Panel>
        <Empty icon="construct-outline" title="Not built yet" text={`${title} is listed in the menu but has no screen yet.`} />
      </Panel>
    </Screen>
  );
}
