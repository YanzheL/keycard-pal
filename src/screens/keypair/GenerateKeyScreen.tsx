import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GenerateKeyScreenProps } from '@/navigation/types';
import theme from '@/theme';

import BlurredSecret from '@/components/BlurredSecret';
import PrimaryButton from '@/components/PrimaryButton';

import { useGenerateKey } from '@/hooks/keycard/useGenerateKey';
import { useKeycardScreen } from '@/hooks/useKeycardScreen';
import { useSeedReviewTimer } from '@/hooks/useSeedReviewTimer';

export const RECOVERY_PHRASE_HIDDEN_LABEL =
  'Recovery phrase hidden. Reveal recovery phrase shows it.';

export default function GenerateKeyScreen({
  navigation,
  route,
}: GenerateKeyScreenProps) {
  const insets = useSafeAreaInsets();
  const [revealed, setRevealed] = useState(false);
  const timer = useSeedReviewTimer();

  const keycard = useGenerateKey(route.params.size);
  const { phase, result, start } = keycard;
  const withPassphrase = route.params.passphrase ?? false;
  const [passphrase, setPassphrase] = useState('');

  useEffect(() => {
    start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (revealed) {
      timer.start();
    }
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const { sheet } = useKeycardScreen({
    keycard,
    navigation,
    title: 'Backup recovery phrase',
  });

  const [hasAttemptedConfirm, setHasAttemptedConfirm] = useState(false);
  const timerDone = timer.done || hasAttemptedConfirm;

  const handleButton = useCallback(() => {
    if (!revealed) {
      setRevealed(true);
      return;
    }
    setHasAttemptedConfirm(true);
    navigation.navigate('ConfirmKey', {
      words: result ?? [],
      passphrase: withPassphrase ? passphrase : undefined,
    });
  }, [revealed, navigation, result, withPassphrase, passphrase]);

  const words = result ?? [];
  const half = words.length / 2;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.description}>
          Write down your recovery phrase and store it in a secure location.
          Never share your recovery phrase with anyone. It gives access to your
          funds.
        </Text>

        {phase === 'done' && result && (
          <>
            <BlurredSecret
              revealed={revealed}
              hiddenLabel={RECOVERY_PHRASE_HIDDEN_LABEL}
              style={styles.wordGridWrapper}
            >
              <View style={styles.wordGrid}>
                <View style={styles.column}>
                  {words.slice(0, half).map((word, i) => (
                    <View key={i} style={styles.wordCell}>
                      <Text style={styles.wordIndex} numberOfLines={1}>
                        {i + 1}.
                      </Text>
                      <Text style={styles.wordText}>{word}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.column}>
                  {words.slice(half).map((word, i) => (
                    <View key={i} style={styles.wordCell}>
                      <Text style={styles.wordIndex} numberOfLines={1}>
                        {half + i + 1}.
                      </Text>
                      <Text style={styles.wordText}>{word}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </BlurredSecret>
            {revealed && withPassphrase && (
              <View style={styles.passphraseContainer}>
                <Text style={styles.passphraseLabel}>Passphrase</Text>
                <TextInput
                  style={styles.passphraseInput}
                  value={passphrase}
                  onChangeText={setPassphrase}
                  placeholder="Enter passphrase "
                  placeholderTextColor={theme.colors.onSurfacePlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {phase === 'done' && (
        <View style={styles.buttonArea}>
          <PrimaryButton
            testID="primary-button"
            label={
              !revealed
                ? 'Reveal recovery phrase'
                : !timerDone
                ? `Write down your recovery phrase (${timer.timeLeft}s)`
                : "I've written it down"
            }
            onPress={handleButton}
            disabled={
              (revealed && !timerDone) ||
              (revealed && withPassphrase && passphrase.trim() === '')
            }
          />
        </View>
      )}

      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    color: theme.colors.onSurface,
    marginBottom: 12,
  },
  description: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 22,
  },
  wordGridWrapper: {
    marginTop: 24,
  },
  wordGrid: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
  },
  wordCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  wordIndex: {
    color: theme.colors.onSurfaceDisabled,
    fontSize: 13,
    minWidth: 22,
    flexShrink: 0,
    textAlign: 'right',
  },
  wordText: {
    color: theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  buttonArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  passphraseContainer: {
    marginTop: 24,
    gap: 8,
  },
  passphraseLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
  passphraseInput: {
    backgroundColor: theme.colors.surfacePassphrase,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.onSurface,
    fontSize: 15,
    fontFamily: 'Inter',
  },
});
