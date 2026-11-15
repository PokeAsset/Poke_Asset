import React from 'react';
import { Alert, Text, View } from 'react-native';
import { colors } from '../theme';
import { Btn, Body, Eyebrow, PageHead, PhotoSlot, Panel, Screen, usePhoto } from '../ui';

export default function Grade() {
  const front = usePhoto();
  const back = usePhoto();
  const closeups = [usePhoto(), usePhoto(), usePhoto()];
  const ready = !!front.uri && !!back.uri;

  const run = () =>
    Alert.alert(
      'Grade estimate needs a backend',
      'Photos are captured. Connect a vision model in src/screens/Grade.tsx to describe centering, corners, edges and surface, then return a PSA band with its confidence and what photos cannot show.',
    );

  const pick = (p: ReturnType<typeof usePhoto>) => () =>
    Alert.alert('Add photo', undefined, [
      { text: 'Take photo', onPress: p.shoot },
      { text: 'Choose from library', onPress: p.choose },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Screen>
      <PageHead
        eyebrow="PokéGrade AI"
        title="Estimate a grade before you submit"
        text="Upload the front and back of one card. The assistant describes centering, corners, edges and visible surface flaws, then gives a plausible PSA grade band with the confidence it deserves — and the areas it cannot judge from photos."
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Panel style={{ flex: 1, padding: 14 }}>
          <PhotoSlot label="FRONT" uri={front.uri} onPress={pick(front)} />
        </Panel>
        <Panel style={{ flex: 1, padding: 14 }}>
          <PhotoSlot label="BACK" uri={back.uri} onPress={pick(back)} />
        </Panel>
      </View>
      <Panel style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Eyebrow>Close-ups (optional)</Eyebrow>
          <Text
            style={{ color: colors.gold, fontSize: 17, fontWeight: '600' }}
            onPress={() => {
              const next = closeups.find((c) => !c.uri);
              if (next) pick(next)();
            }}
          >
            Add
          </Text>
        </View>
        <Body style={{ fontSize: 16 }}>
          Angled or macro shots of corners, edges and the holo surface improve the read considerably.
        </Body>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {closeups.map((c, i) =>
            c.uri ? (
              <View key={i} style={{ flex: 1, height: 90 }}>
                <PhotoSlot uri={c.uri} onPress={c.clear} />
              </View>
            ) : null,
          )}
        </View>
      </Panel>
      <Btn kind="gold" label={ready ? 'Estimate grade' : 'Add front and back to continue'} onPress={ready ? run : undefined} />
    </Screen>
  );
}
