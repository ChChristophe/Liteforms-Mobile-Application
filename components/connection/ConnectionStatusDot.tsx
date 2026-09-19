import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  CONNECTION_STATUS_META,
  connectionPanelDetail,
  deriveConnectionStatus,
} from '../../lib/connection/status';

/**
 * Pastille d'etat de la liaison Mobile <-> Electron.
 *
 * UX (decision produit) :
 * - une seule pastille, aucune phrase a cote dans l'en-tete : vert =
 *   connecte, ambre = verification en cours, rouge = deconnecte/erreur ;
 * - un tap ouvre un petit panneau lisible : etat, derniere erreur
 *   (`lastError`) et lien vers l'ecran de connexion ;
 * - « Reverifier » relance `checkHealth` (health check du Desktop connu).
 *
 * Source d'etat : `connectionStore` uniquement (aucun etat de liaison
 * duplique). Le panneau se contente de refleter le store ; il ne contient
 * aucune donnee sensible (role, IP ou nom d'appliance non affiches).
 *
 * Au demontage : aucun effet de bord (le store persiste, la modale
 * disparait avec le composant).
 */
export function ConnectionStatusDot() {
  const router = useRouter();
  const connectedDesktop = useConnectionStore((s) => s.connectedDesktop);
  const checking = useConnectionStore((s) => s.checking);
  const lastError = useConnectionStore((s) => s.lastError);
  const checkHealth = useConnectionStore((s) => s.checkHealth);
  const [open, setOpen] = useState(false);

  const status = deriveConnectionStatus({ connectedDesktop, checking });
  const meta = CONNECTION_STATUS_META[status];

  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={meta.accessibilityLabel}
        hitSlop={12}
        onPress={() => setOpen(true)}
        style={styles.touchTarget}
      >
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            accessibilityRole="button"
            accessibilityLabel="Fermer le panneau de liaison"
            onPress={close}
          />
          <View
            style={styles.panel}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
          >
            <View style={styles.headerRow}>
              <View style={[styles.panelDot, { backgroundColor: meta.color }]} />
              <Text style={styles.statusLabel}>{meta.label}</Text>
            </View>
            <Text style={styles.detailText}>
              {connectionPanelDetail(status, lastError)}
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                status === 'checking' && styles.buttonDisabled,
                pressed && styles.primaryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Revérifier la liaison"
              disabled={status === 'checking'}
              onPress={() => {
                void checkHealth();
              }}
            >
              <Text style={styles.primaryButtonText}>
                {status === 'checking' ? 'Vérification…' : 'Revérifier'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.linkButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir l'écran de connexion"
              onPress={() => {
                close();
                router.push('/connect');
              }}
            >
              <Text style={styles.linkText}>Connexion…</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  panel: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 12,
    // Elévation discrète : le panneau doit se détacher du fond assombri.
    elevation: 6,
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonPressed: {
    backgroundColor: '#3b7cc4',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonPressed: {
    opacity: 0.7,
  },
  linkText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
});
