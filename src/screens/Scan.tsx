import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { Btn, Empty, Loading, PageHead, PhotoSlot, Panel, Screen, usePhoto } from '../ui';
import { formatDate, formatMoney, matchCards } from '../api';
import { identifyCard, identifySealed, searchSealed, CardGuess, SealedGuess, SealedItem } from '../server';
import { Card } from '../types';
import { CardRow } from './CardDetail';

function PhotoBox({ photo, emptyTitle, emptyText }: { photo: ReturnType<typeof usePhoto>; emptyTitle: string; emptyText: string }) {
  return (
    <Panel style={{ padding: 0, overflow: 'hidden', borderRadius: radius.lg }}>
      {photo.uri ? (
        <PhotoSlot uri={photo.uri} onPress={photo.choose} />
      ) : (
        <View style={{ height: 360, justifyContent: 'center' }}>
          <Empty icon="scan-outline" title={emptyTitle} text={emptyText} />
        </View>
      )}
    </Panel>
  );
}

const confText = (c?: number) =>
  c == null ? '' : c >= 0.8 ? 'High confidence' : c >= 0.5 ? 'Medium confidence — check the match' : 'Low confidence — check the match';

/** Card scanner: photo -> Gemini reads the card -> catalog match -> price. */
export default function Scan() {
  const nav = useNavigation<any>();
  const photo = usePhoto();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [guess, setGuess] = useState<CardGuess | null>(null);
  const [matches, setMatches] = useState<Card[] | null>(null);

  const identify = async () => {
    if (!photo.photo) return;
    setBusy(true);
    setError('');
    setGuess(null);
    setMatches(null);
    try {
      const g = await identifyCard(photo.photo);
      setGuess(g);
      if (g.name) setMatches(await matchCards(g.name, g.number, g.setName));
    } catch (e: any) {
      setError(e?.message ?? 'Scan failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHead
        eyebrow="Card scanner"
        title="Scan a card, get its price"
        text="Take or choose a photo of a Pokémon card. The AI reads the name and number, we match it against the catalog and show its market price."
      />
      <PhotoBox photo={photo} emptyTitle="No photo yet" emptyText="Fill the frame with the card and keep the bottom number line in view." />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Btn kind="gold" label="Take photo" icon="camera-outline" onPress={photo.shoot} />
        <Btn label="Choose photo" icon="images-outline" onPress={photo.choose} />
      </View>
      {photo.error ? <Text style={{ color: colors.red }}>{photo.error}</Text> : null}
      {photo.uri ? (
        <Btn kind="gold" label={busy ? 'Reading the card…' : 'Identify'} icon="search" disabled={busy} onPress={identify} />
      ) : null}
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {guess ? (
        <Panel style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>WHAT THE AI READ</Text>
          {guess.name ? (
            <Text style={{ color: colors.text, fontSize: 18 }}>
              {guess.name}
              {guess.number ? ` · #${guess.number}${guess.printedTotal ? `/${guess.printedTotal}` : ''}` : ''}
              {guess.setName ? ` · ${guess.setName}` : ''}
            </Text>
          ) : (
            <Text style={{ color: colors.text }}>It could not read a Pokémon card in this photo.</Text>
          )}
          <Text style={{ color: colors.muted }}>
            {confText(guess.confidence)} {guess.notes ? `· ${guess.notes}` : ''}
          </Text>
        </Panel>
      ) : null}
      {matches ? (
        <Panel>
          {matches.length === 0 ? (
            <Text style={{ color: colors.muted }}>No catalog card matched. Try a clearer photo of the whole card.</Text>
          ) : (
            matches.slice(0, 8).map((c) => (
              <CardRow key={c.id} card={c} onPress={() => nav.navigate('CardDetail', { card: c })} />
            ))
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}

/** Sealed scanner: photo -> Gemini reads the box -> sealed product search -> price. */
export function SealedScan() {
  const photo = usePhoto();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [guess, setGuess] = useState<SealedGuess | null>(null);
  const [items, setItems] = useState<SealedItem[] | null>(null);
  const [priceError, setPriceError] = useState('');

  const identify = async () => {
    if (!photo.photo) return;
    setBusy(true);
    setError('');
    setPriceError('');
    setGuess(null);
    setItems(null);
    try {
      const g = await identifySealed(photo.photo);
      setGuess(g);
      if (g.productName) {
        try {
          setItems(await searchSealed(g.productName));
        } catch (e: any) {
          setPriceError(e?.message ?? 'Could not look up prices.');
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Scan failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHead
        eyebrow="Sealed scanner"
        title="Scan a box, tin or bundle"
        text="Photograph the front of any sealed Pokémon product. The AI reads the packaging and we look up the product and its market price."
      />
      <PhotoBox photo={photo} emptyTitle="No packaging photo yet" emptyText="Include the front of the box where the product name and set are printed." />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Btn kind="gold" label="Take photo" icon="camera-outline" onPress={photo.shoot} />
        <Btn label="Choose photo" icon="images-outline" onPress={photo.choose} />
      </View>
      {photo.error ? <Text style={{ color: colors.red }}>{photo.error}</Text> : null}
      {photo.uri ? (
        <Btn kind="gold" label={busy ? 'Reading the box…' : 'Identify'} icon="search" disabled={busy} onPress={identify} />
      ) : null}
      {busy ? <Loading /> : null}
      {error ? <Text style={{ color: colors.red, lineHeight: 22 }}>{error}</Text> : null}
      {guess ? (
        <Panel style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, letterSpacing: 3, fontWeight: '700', fontSize: 13 }}>WHAT THE AI READ</Text>
          <Text style={{ color: colors.text, fontSize: 18 }}>
            {guess.productName ?? 'It could not read a Pokémon product in this photo.'}
          </Text>
          {guess.productName ? (
            <Text style={{ color: colors.muted }}>
              {[guess.setName, guess.productType, guess.language].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <Text style={{ color: colors.muted }}>
            {confText(guess.confidence)} {guess.notes ? `· ${guess.notes}` : ''}
          </Text>
        </Panel>
      ) : null}
      {priceError ? <Text style={{ color: colors.red, lineHeight: 22 }}>{priceError}</Text> : null}
      {items ? (
        <Panel style={{ gap: 12 }}>
          {items.length === 0 ? (
            <Text style={{ color: colors.muted }}>No sealed product matched that name. Try the Sealed products page and search by set.</Text>
          ) : (
            items.slice(0, 8).map((p, i) => (
              <View key={`${p.id ?? p.name}-${i}`} style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 17 }}>{p.name}</Text>
                <Text style={{ color: colors.muted }}>
                  {[p.setName, p.type].filter(Boolean).join(' · ')}
                  {p.updatedAt ? ` · updated ${formatDate(p.updatedAt)}` : ''}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  Market {formatMoney(p.market)}
                  {p.low != null ? ` · Low ${formatMoney(p.low)}` : ''}
                </Text>
              </View>
            ))
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}
