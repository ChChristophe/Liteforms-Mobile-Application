import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { hasProvisioningStatus } from '../../lib/network/deviceClient';
import { useOnboardingStore } from '../../stores/onboardingStore';

/**
 * Onboarding « zéro IP » (dec. 13/09/2026) : un seul ecran a etapes piloté
 * par `onboardingStore.phase`.
 *
 * - idle/discovering/sending : recherche automatique (spinner) ;
 * - needHotspot (ECRAN 1) : instructions + ouverture des reglages WiFi ;
 * - wifiForm (ECRAN 2) : SSID + mot de passe (mots cibles jamais persistes) ;
 * - switching (ECRAN 3) : bascule WiFi guidee + polling
 *   `/api/provisioning/status` + scan LAN pour re-matcher le deviceId —
 *   l'echec fetch post-202 est une transition normale, jamais affichée ;
 * - connected : confirmation ; Continuer -> menu de configuration.
 * - failed : raison affichable + relance.
 *
 * Au demontage : la boucle de polling/scan est arretee ; le store garde son
 * etat (relancement sans perte).
 */
export default function ConnectScreen() {
  const router = useRouter();
  const phase = useOnboardingStore((s) => s.phase);
  const lastError = useOnboardingStore((s) => s.lastError);
  const startDiscovery = useOnboardingStore((s) => s.startDiscovery);
  const retryDiscovery = useOnboardingStore((s) => s.retryDiscovery);
  const submitWifi = useOnboardingStore((s) => s.submitWifi);
  const reset = useOnboardingStore((s) => s.reset);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  // Œil du champ mot de passe : etat local a l'ecran, jamais persiste.
  const [showPassword, setShowPassword] = useState(false);
  const switchingRef = useRef(false);
  // Boucle « switching » : nombre de scans LAN infructueux consecutifs.
  // Sert uniquement a afficher une aide (pas une erreur) apres ~4 echecs,
  // car l'appliance peut mettre du temps a rejoindre le WiFi cible.
  const [scanFailures, setScanFailures] = useState(0);

  // Lancement/reprise : recherche automatique a l'entree de l'ecran.
  useEffect(() => {
    if (phase === 'idle') void startDiscovery();
  }, [phase, startDiscovery]);

  // ECRAN 3 : boucle polling statut (hotspot) + scan LAN (deviceId) tant
  // que la phase est `switching`. Arretee a la sortie (ref + phase guard).
  // Le compteur d'echecs de scan repart de zero a chaque entree en
  // `switching` (chaque SUMbitWifi / relance).
  useEffect(() => {
    if (phase !== 'switching') return;
    switchingRef.current = false;
    setScanFailures(0);
    let cancelled = false;
    const poll = useOnboardingStore.getState;

    const tick = async () => {
      if (cancelled || switchingRef.current) return;
      switchingRef.current = true;
      try {
        const status = await poll().pollProvisioning();
        if (cancelled) return;
        const emitting = status === null || !status.reachable;
        const joinOk = !emitting && hasProvisioningStatus(status) && status.status.phase === "joined";
        if (emitting || joinOk) {
          // Hotspot mort (bascule reussie probable) ou `joined` :
          // lancer le scan de re-match deviceId sans attendre.
          const result = await poll().searchAfterSwitch();
          if (!cancelled && result !== null && !result.found) {
            setScanFailures((n) => n + 1);
          }
        }
      } finally {
        switchingRef.current = false;
      }
    };
    const timer = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase]);

  const onSendWifi = useCallback(async () => {
    if (ssid.trim().length === 0) {
      useOnboardingStore.setState({ lastError: 'Le SSID du WiFi maison est requis.' });
      return;
    }
    await submitWifi(ssid, password);
    setPassword('');
  }, [password, ssid, submitWifi]);

  if (phase === 'wifiForm') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Votre WiFi</Text>
          <Text style={styles.hint}>
            Dites à l'appliance quel WiFi rejoindre. Le mot de passe est
            envoyé une seule fois, jamais conservé dans l'application.
          </Text>
          <Text style={styles.label}>SSID du WiFi maison</Text>
          <TextInput
            style={styles.input}
            value={ssid}
            onChangeText={setSsid}
            placeholder="Nom du réseau WiFi"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="SSID du WiFi maison"
          />
          <Text style={styles.label}>Mot de passe WiFi</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Vide si le réseau est ouvert"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              accessibilityLabel="Mot de passe du WiFi maison"
            />
            <Pressable
              style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={
                showPassword
                  ? 'Masquer le mot de passe'
                  : 'Afficher le mot de passe'
              }
              hitSlop={8}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={styles.eyeGlyph} accessibilityElementsHidden>
                {showPassword ? '🙈' : '👁'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.error}>{lastError}</Text>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            onPress={() => void onSendWifi()}
          >
            <Text style={styles.buttonText}>Envoyer à l'appliance</Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            accessibilityRole="button"
            onPress={() => void reset()}
          >
            <Text style={styles.linkText}>Relancer la recherche</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'switching' || phase === 'sending') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Connexion en cours</Text>
          <ActivityIndicator color="#4a90d9" style={styles.activity} />
          <Text style={styles.hint}>
            Rejoignez maintenant votre WiFi maison sur le téléphone
            (réglages WiFi du système). Lors de la bascule, nous
            recherchons automatiquement l'appliance — surtout, ne fermez
            pas cette page.
          </Text>
          {phase === 'switching' && scanFailures >= 4 && (
            <Text style={styles.scanHelp}>
              Toujours introuvable — vérifiez que le téléphone est bien
              connecté au même réseau WiFi que l'appliance, puis patientez
              quelques secondes.
            </Text>
          )}
          <Pressable
            style={styles.secondaryButton}
            accessibilityRole="button"
            onPress={() => {
              void Linking.openSettings();
            }}
          >
            <Text style={styles.secondaryButtonText}>Ouvrir les réglages WiFi</Text>
          </Pressable>
          {lastError !== null && <Text style={styles.error}>{lastError}</Text>}
          <Pressable
            style={styles.linkButton}
            accessibilityRole="button"
            onPress={() => void reset()}
          >
            <Text style={styles.linkText}>Annuler l'appairage</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'connected') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.statusCard}>
            <Text style={styles.statusOk}>Appliance appariée ✓</Text>
          </View>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            onPress={() => router.replace('/')}
          >
            <Text style={styles.buttonText}>Continuer la configuration</Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            accessibilityRole="button"
            onPress={() => router.push('/advanced-connection')}
          >
            <Text style={styles.linkText}>Paramètres avancés (IP / port)</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'failed') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Connexion non établie</Text>
          <Text style={styles.error}>{lastError ?? 'Erreur inconnue.'}</Text>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            onPress={() => void retryDiscovery()}
          >
            <Text style={styles.buttonText}>Réessayer</Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            accessibilityRole="button"
            onPress={() => void reset()}
          >
            <Text style={styles.linkText}>Refaire l'appairage</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // idle / discovering / needHotspot : ECRAN 1 si aucun hotspot connu.
  const discovering = phase === 'discovering' || phase === 'idle';
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {discovering ? (
          <>
            <Text style={styles.title}>Recherche de l'appliance…</Text>
            <ActivityIndicator color="#4a90d9" style={styles.activity} />
            <Text style={styles.hint}>
              Nous scannons le réseau local pour trouver votre Desktop
              Liteforms. Cela peut prendre une dizaine de secondes.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Rejoignez le réseau de l'appliance</Text>
            <Text style={styles.hint}>
              Dans les réglages WiFi du système, connectez-vous au réseau
              Liteforms-Setup-XXXX démarré par l'appliance. Puis revenez
              ici et relancez la recherche.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              onPress={() => {
                void Linking.openSettings();
              }}
            >
              <Text style={styles.secondaryButtonText}>Ouvrir les réglages WiFi</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={() => void retryDiscovery()}
            >
              <Text style={styles.buttonText}>Relancer la recherche</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  eyeButton: { paddingHorizontal: 12, paddingVertical: 10 },
  eyeGlyph: { fontSize: 18, color: '#6b7280' },
  hint: { fontSize: 13, lineHeight: 18, color: '#9ca3af', marginBottom: 8 },
  scanHelp: {
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  error: { fontSize: 13, color: '#dc2626', marginBottom: 8, marginTop: 8 },
  activity: { marginBottom: 12 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  linkButton: {
    marginTop: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: '#4a90d9', fontSize: 14 },
  statusCard: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  statusOk: { fontSize: 15, fontWeight: '600', color: '#15803d' },
});
