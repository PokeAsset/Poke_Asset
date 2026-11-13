import React from 'react';
import { Text, View } from 'react-native';
import { Alert } from 'react-native';
import { colors, radius } from '../theme';
import { Btn, Empty, PageHead, PhotoSlot, Panel, Screen, usePhoto } from '../ui';

/** Shared layout for the card scanner and sealed scanner. */
function Scanner({
  eyebrow,
  title,
  text,
  emptyTitle,
  emptyText,
  extraButton,
}: {
  eyebrow: string;
  title: string;
  text: string;
  emptyTitle: string;
  emptyText: string;
  extraButton?: { label: string; icon: any };
}) {
  const photo = usePhoto();
  const identify = () =>
    Alert.alert(
      'Recognition needs a backend',
      'Photo capture works. Connect an image-recognition service in src/screens/Scan.tsx to match the photo against the catalog.',
    );
  return (
    <Screen>
      <PageHead eyebrow={eyebrow} title={title} text={text} />
      <Panel style={{ padding: 0, overflow: 'hidden', borderRadius: radius.lg }}>
        {photo.uri ? (
          <PhotoSlot uri={photo.uri} onPress={photo.choose} />
        ) : (
          <View style={{ height: 420, justifyContent: 'center' }}>
            <Empty icon="scan-outline" title={emptyTitle} text={emptyText} />
          </View>
        )}
      </Panel>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Btn kind="gold" label="Take photo" icon="camera-outline" onPress={photo.shoot} />
        <Btn label="Choose photo" icon="images-outline" onPress={photo.choose} />
        {extraButton ? <Btn label={extraButton.label} icon={extraButton.icon} onPress={identify} /> : null}
      </View>
      {photo.uri ? <Btn kind="gold" label="Identify" icon="search" onPress={identify} /> : null}
    </Screen>
  );
}

export default function Scan() {
  return (
    <Scanner
      eyebrow="Card scanner"
      title="Scan a card, get its price"
      text="Point your camera at any Pokémon card. We read the label from the photo, match it against the catalog and show the current market price plus any graded comps on record."
      emptyTitle="No photo yet"
      emptyText="Fill the frame with the card and keep the bottom number line in view."
    />
  );
}

export function SealedScan() {
  return (
    <Scanner
      eyebrow="Sealed scanner"
      title="Scan a box, tin or bundle"
      text="Photograph the packaging of any sealed Pokémon product — booster boxes, Elite Trainer Boxes, bundles, tins, blisters, collection boxes or ultra-premium collections — or scan its barcode. The catalog match, stored market price and verified pull-rate research come with it."
      emptyTitle="No packaging photo yet"
      emptyText="Include the front of the box where the product name, expansion and pack count are printed."
      extraButton={{ label: 'Scan barcode', icon: 'barcode-outline' }}
    />
  );
}
