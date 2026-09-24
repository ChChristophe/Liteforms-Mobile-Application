import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthRequest } from 'expo-auth-session';
import {
  fetchSpotifyStatus,
  sendSpotifyToken,
} from '../../lib/network/spotifyClient';
import {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  exchangeCodeForTokens,
} from '../../lib/spotify/spotifyAuth';
import {
  SPOTIFY_AUTHORIZE_ENDPOINT,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_SCOPES,
  spotifyRedirectUri,
} from '../../lib/spotify/config';
import { useConnectionStore } from '../../stores/connectionStore';
import type { SpotifyStatusResponse } from '../../types/device';

/**
 * Ecran « Spotify » : connexion du compte depuis le telephone (protocole
 * `DEVICE_API.md` §« Spotify — connexion, appareils et controle », 24/09/2026).
 *
 * Flux : bouton -> consentement Spotify (Authorization Code + PKCE, client
 * public, aucun secret) -> echange code -> tokens -> envoi du **refresh token**
 * a l'appliance (`POST /api/spotify/auth`). L'appliance l'ecrit dans le profil
 * `spogo` ; le Mobile n'en garde rien.
 *
 * L'ouverture du navigateur et la verification d'etat CSRF sont deleguees a
 * `expo-auth-session` ; les primitives PKCE testables vivent dans
 * `lib/spotify/spotifyAuth.ts`.
 *
 * Limite : l'OAuth par **custom scheme** (`com.liteforms.app://callback`)
 * necessite un **Development Build** (`expo-dev-client`). Expo Go ne peut pas
 * enregistrer ce scheme ; l'ecran de nommage des appareils, lui, fonctionne
 * sans OAuth.
 *
 * Coordonnees lues dans `connectionStore` (comme les autres ecrans) ; sans
 * appliance connectee, l'ecran n'appelle rien.
 */
export default function SpotifyScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = host !== null && port !== null;

  const [status, setStatus] = useState<SpotifyStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const busy = loading || connecting;

  /** Relit le statut Spotify de l'appliance (no-op si non connecte). */
  const refresh = useCallback(async () => {
    if (host === null || port === null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSpotifyStatus(host, port);
      if (result.ok) setStatus(result);
      else setError(result.error);
    } finally {
      setLoading(false);
    }
  }, [host, port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Ouvre le consentement Spotify (PKCE), echange le code, puis transfere le
   * refresh token a l'appliance. La config PKCE est construite ici puis passee
   * a `AuthRequest` via `url` ; `expo-auth-session` gere le retour (deep link)
   * et verifie le `state`.
   */
  async function onConnect(): Promise<void> {
    if (host === null || port === null) return;
    setConnecting(true);
    setError(null);
    setMessage(null);
    try {
      const redirectUri = spotifyRedirectUri();
      const request = new AuthRequest({
        clientId: SPOTIFY_CLIENT_ID,
        scopes: [...SPOTIFY_SCOPES],
        redirectUri,
        usePKCE: false,
      });
      const codeVerifier = createCodeVerifier();
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const url = buildAuthorizeUrl({
        clientId: SPOTIFY_CLIENT_ID,
        redirectUri,
        codeChallenge,
        state: request.state,
      });
      const result = await request.promptAsync(
        { authorizationEndpoint: SPOTIFY_AUTHORIZE_ENDPOINT },
        { url }
      );

      if (result.type === 'error') {
        const description =
          result.params.error_description ?? result.params.error;
        setError(
          typeof description === 'string' && description.length > 0
            ? description
            : 'Connexion Spotify échouée.'
        );
        return;
      }
      if (result.type !== 'success') {
        setError('Connexion Spotify annulée.');
        return;
      }
      const code = result.params.code;
      if (typeof code !== 'string' || code.length === 0) {
        setError("Spotify n'a pas renvoyé de code d'autorisation.");
        return;
      }

      const exchange = await exchangeCodeForTokens({ code, codeVerifier, redirectUri });
      if (!exchange.ok) {
        setError(exchange.error);
        return;
      }
      const { tokens } = exchange;
      const sent = await sendSpotifyToken(host, port, {
        clientId: SPOTIFY_CLIENT_ID,
        refreshToken: tokens.refreshToken,
        ...(tokens.accessToken.length > 0 ? { accessToken: tokens.accessToken } : {}),
        ...(tokens.scope !== null ? { scope: tokens.scope } : {}),
        ...(tokens.expiresIn !== null ? { expiresIn: tokens.expiresIn } : {}),
      });
      if (!sent.ok) {
        setError(sent.error);
        return;
      }
      setMessage("Spotify connecté sur l'appliance.");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Connexion Spotify échouée.'
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!connected ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Aucune appliance connectée. Connectez-vous d'abord pour relier
              Spotify depuis le téléphone.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              onPress={() => router.push('/connect')}
            >
              <Text style={styles.secondaryButtonText}>Connecter l'appliance</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              {loading && status === null ? (
                <Text style={styles.statusText}>Lecture du statut Spotify…</Text>
              ) : status === null ? (
                <Text style={styles.statusText}>Statut Spotify indisponible.</Text>
              ) : status.configured ? (
                <>
                  <Text style={styles.statusOk}>Spotify connecté</Text>
                  <Text style={styles.statusText}>
                    {status.available
                      ? 'La commande spogo est disponible sur l\'appliance.'
                      : "L'appliance est connectée mais sa commande spogo est indisponible."}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statusOff}>Spotify non connecté</Text>
                  <Text style={styles.statusText}>
                    Connecte ton compte Spotify pour piloter la lecture à la voix.
                  </Text>
                </>
              )}
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Compte Premium requis</Text>
              <Text style={styles.statusText}>
                Le contrôle de la lecture (Spotify Connect) nécessite un compte
                Spotify Premium.
              </Text>
            </View>

            {connecting && (
              <View style={styles.busyBox}>
                <ActivityIndicator color="#4a90d9" />
                <Text style={styles.busyText}>
                  Consentement Spotify en cours…
                </Text>
              </View>
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}
            {message !== null && <Text style={styles.success}>{message}</Text>}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onConnect()}
            >
              <Text style={styles.buttonText}>
                {connecting
                  ? 'Connexion…'
                  : status?.configured
                    ? 'Reconnecter Spotify'
                    : 'Se connecter à Spotify'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => router.push('/spotify-devices')}
            >
              <Text style={styles.secondaryButtonText}>Nommer les appareils</Text>
            </Pressable>

            <Pressable
              style={[styles.linkButton, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void refresh()}
            >
              <Text style={styles.linkText}>
                {loading ? 'Rafraîchissement…' : 'Rafraîchir'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingBottom: 48 },
  statusCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  statusOk: { fontSize: 15, fontWeight: '600', color: '#15803d' },
  statusOff: { fontSize: 15, fontWeight: '600', color: '#b45309' },
  statusText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  noteCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    gap: 4,
  },
  noteTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  hintCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
  },
  hintText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  busyBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 16,
  },
  busyText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#1d4ed8' },
  error: { fontSize: 13, color: '#dc2626', marginTop: 12 },
  success: { fontSize: 13, color: '#15803d', marginTop: 12 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  linkButton: {
    marginTop: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: '#4a90d9', fontSize: 14 },
});
