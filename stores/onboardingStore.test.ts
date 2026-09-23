import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Machine a etats onboarding « zéro IP » (13/09/2026), testée en Node :
 * AsyncStorage absent de RN — la couche storage est mockee ; le client
 * reseau et la decouverte sont mockes pour piloter les transitions.
 *
 * Regressions protegees :
 * - reconnexion auto : coordonnees connues -> connected sans scan ;
 * - echec de scan -> needHotspot, Hotspot appris -> wifiForm ;
 * - l'echec fetch du POST wifi ne bloque pas le flow (202 parti, hotspot
 *   mort = transition normale) -> switching, PAS failed ;
 * - failed vient uniquement de provisioning/status (phase=failed réel).
 */
vi.mock("../lib/storage/connectionStorage", () => ({
  loadConnectionInfo: vi.fn(),
  saveConnectionInfo: vi.fn().mockResolvedValue(undefined),
  clearConnectionInfo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/network/deviceClient", () => ({
  fetchDesktopHealth: vi.fn(),
  sendWifiProvisioning: vi.fn(),
  fetchProvisioningStatus: vi.fn(),
  sendDeviceConfig: vi.fn(),
  hasProvisioningStatus: vi.fn(
    (r: { reachable: boolean; status?: unknown; invalid?: boolean }) =>
      r.reachable && !(r as { invalid?: boolean }).invalid
  ),
}));

vi.mock("../lib/network/discovery", () => ({
  discoverDesktop: vi.fn(),
  getLocalIpAddress: vi.fn(),
}));

import {
  clearConnectionInfo,
  loadConnectionInfo,
} from "../lib/storage/connectionStorage";
import {
  fetchDesktopHealth,
  fetchProvisioningStatus,
  sendDeviceConfig,
  sendWifiProvisioning,
} from "../lib/network/deviceClient";
import { discoverDesktop, getLocalIpAddress } from "../lib/network/discovery";
import { useOnboardingStore } from "./onboardingStore";
import { useConnectionStore } from "./connectionStore";

const mockLoad = vi.mocked(loadConnectionInfo);
const mockClear = vi.mocked(clearConnectionInfo);
const mockHealth = vi.mocked(fetchDesktopHealth);
const mockSendWifi = vi.mocked(sendWifiProvisioning);
const mockSendConfig = vi.mocked(sendDeviceConfig);
const mockStatus = vi.mocked(fetchProvisioningStatus);
const mockDiscover = vi.mocked(discoverDesktop);
const mockLocalIp = vi.mocked(getLocalIpAddress);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue(null);
  mockLocalIp.mockResolvedValue("192.168.1.42");
  mockSendWifi.mockResolvedValue({ ok: true });
  useOnboardingStore.setState({ phase: "idle", hotspot: null, lastError: null });
  useConnectionStore.setState({
    host: null,
    port: null,
    deviceId: null,
    connectedDesktop: null,
    checking: false,
    lastError: null,
  });
});

describe("onboardingStore.startDiscovery", () => {
  it("coordonnées connues + health ok = connected, sans scan", async () => {
    mockLoad.mockResolvedValue({
      host: "192.168.1.53",
      port: 43178,
      deviceId: "desktop-8f31",
    });
    mockHealth.mockResolvedValue({
      ok: true,
      desktopName: "Liteforms Desktop",
      deviceId: "desktop-8f31",
      protocolVersionMatches: true,
      configVersionSupported: true,
    });
    await useOnboardingStore.getState().startDiscovery();
    expect(useOnboardingStore.getState().phase).toBe("connected");
    expect(mockDiscover).not.toHaveBeenCalled();
  });

  it("coordonnées KO + scan trouvé (deviceId strict) = mise à jour silencieuse", async () => {
    mockLoad.mockResolvedValue({
      host: "192.168.1.53",
      port: 43178,
      deviceId: "desktop-8f31",
    });
    mockHealth
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        ok: true,
        desktopName: "Liteforms Desktop",
        deviceId: "desktop-8f31",
        protocolVersionMatches: true,
        configVersionSupported: true,
      });
    mockDiscover.mockResolvedValue({
      ok: true,
      host: "192.168.1.99",
      port: 43178,
      deviceId: "desktop-8f31",
      name: "Liteforms Desktop",
    });
    await useOnboardingStore.getState().startDiscovery();
    expect(useOnboardingStore.getState().phase).toBe("connected");
    expect(mockDiscover).toHaveBeenCalledWith("192.168.1.42", {
      deviceId: "desktop-8f31",
      acceptProvisioning: false,
    });
    expect(useConnectionStore.getState().host).toBe("192.168.1.99");
  });

  it("rien du tout = needHotspot (pas un echec fatal)", async () => {
    mockDiscover.mockResolvedValue({ ok: false, error: "rien" });
    await useOnboardingStore.getState().startDiscovery();
    expect(useOnboardingStore.getState().phase).toBe("needHotspot");
  });

  it("LAN vide puis hotspot provisioning trouvé = wifiForm, sans device-config", async () => {
    // Aucune coordonnée stockée : le lancement sur le hotspot Liteforms-Setup
    // ne doit plus exiger « Relancer la recherche ».
    mockDiscover
      .mockResolvedValueOnce({ ok: false, error: "rien" })
      .mockResolvedValueOnce({
        ok: true,
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      });
    await useOnboardingStore.getState().startDiscovery();
    expect(useOnboardingStore.getState().phase).toBe("wifiForm");
    expect(useOnboardingStore.getState().hotspot).toEqual({
      host: "192.168.4.1",
      port: 8080,
      deviceId: "desktop-8f31",
      name: "Liteforms Desktop",
    });
    // Le 2e scan est bien le mode provisioning (port 8080, pas de match strict).
    expect(mockDiscover).toHaveBeenLastCalledWith("192.168.1.42", {
      deviceId: null,
      acceptProvisioning: true,
    });
    // On apprend le hotspot, on ne se connecte pas et on n'envoie pas la config.
    expect(useConnectionStore.getState().host).toBe(null);
    expect(mockSendConfig).not.toHaveBeenCalled();
  });
});

describe("onboardingStore.retryDiscovery / submitWifi", () => {
  it("appliance en provisioning sur le LAN courant = hotspot appris, wifiForm", async () => {
    mockDiscover
      .mockResolvedValueOnce({ ok: false, error: "rien" })
      .mockResolvedValueOnce({
        ok: true,
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      });
    await useOnboardingStore.getState().retryDiscovery();
    expect(useOnboardingStore.getState().phase).toBe("wifiForm");
    expect(useOnboardingStore.getState().hotspot).toEqual({
      host: "192.168.4.1",
      port: 8080,
      deviceId: "desktop-8f31",
      name: "Liteforms Desktop",
    });
  });

  it("submitWifi : echec d'envoi (hotspot mort) passe quand meme en switching", async () => {
    useOnboardingStore.setState({
      hotspot: {
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      },
    });
    mockSendWifi.mockResolvedValue({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
    await useOnboardingStore.getState().submitWifi("maison", "secret");
    expect(useOnboardingStore.getState().phase).toBe("switching");
  });

  it("submitWifi : SSID requis, aucune requete envoyee", async () => {
    useOnboardingStore.setState({
      hotspot: {
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      },
    });
    await useOnboardingStore.getState().submitWifi("   ", "x");
    expect(useOnboardingStore.getState().lastError).toMatch(/SSID/);
    expect(mockSendWifi).not.toHaveBeenCalled();
  });
});

describe("onboardingStore.pollProvisioning / searchAfterSwitch", () => {
  it("phase=failed est la seule source d'echec affichee", async () => {
    useOnboardingStore.setState({
      hotspot: {
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      },
    });
    mockStatus.mockResolvedValue({
      reachable: true,
      status: { ok: true, phase: "failed" },
    });
    await useOnboardingStore.getState().pollProvisioning();
    expect(useOnboardingStore.getState().phase).toBe("failed");
  });

  it("hotspot injoignable = reachable:false, PAS une erreur", async () => {
    useOnboardingStore.setState({
      hotspot: {
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      },
    });
    mockStatus.mockResolvedValue({ reachable: false });
    await useOnboardingStore.getState().pollProvisioning();
    expect(useOnboardingStore.getState().phase).not.toBe("failed");
  });

  it("searchAfterSwitch matche le deviceId du hotspot et connecte", async () => {
    useOnboardingStore.setState({
      phase: "switching",
      hotspot: {
        host: "192.168.4.1",
        port: 8080,
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
      },
    });
    mockDiscover.mockResolvedValue({
      ok: true,
      host: "192.168.1.99",
      port: 43178,
      deviceId: "desktop-8f31",
      name: "Liteforms Desktop",
    });
    const result = await useOnboardingStore.getState().searchAfterSwitch();
    expect(result).toEqual({ found: true });
    expect(useOnboardingStore.getState().phase).toBe("connected");
    expect(useConnectionStore.getState().deviceId).toBe("desktop-8f31");
  });

  it("searchAfterSwitch : en mode provisioning le scan ne connecte pas", async () => {
    useOnboardingStore.setState({
      phase: "switching",
      hotspot: null,
    });
    mockDiscover.mockResolvedValue({ ok: false, error: "rien" });
    const result = await useOnboardingStore.getState().searchAfterSwitch();
    expect(result).toEqual({ found: false });
  });
});

describe("onboardingStore.reset", () => {
  it("oublie tout et revient a l'ecran 1", async () => {
    mockLoad.mockResolvedValue({
      host: "192.168.1.53",
      port: 43178,
      deviceId: "desktop-8f31",
    });
    await useOnboardingStore.getState().reset();
    expect(mockClear).toHaveBeenCalled();
    expect(useOnboardingStore.getState().phase).toBe("needHotspot");
    expect(useOnboardingStore.getState().hotspot).toBe(null);
    expect(useConnectionStore.getState().host).toBe(null);
  });
});
