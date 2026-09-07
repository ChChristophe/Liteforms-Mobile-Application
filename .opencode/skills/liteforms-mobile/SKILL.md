---
name: liteforms-mobile
description: Project-specific guidance for Liteforms Mobile, the Expo SDK 57 React Native remote-control and configuration app with a native Three.js/VRM preview.
---

# Liteforms Mobile

## Role and scope

Liteforms Mobile is a smartphone remote control and configuration product. It
does not execute OpenAI, Anthropic, Google, TTS, STT, OpenClaw, wake-word, or
chat workloads. Those belong to Electron/Desktop.

The Web repository is the functional reference for character, mood, alcove,
VRM, and provider concepts. It is not a template for mobile markup or browser
APIs. The phone should feel native and should send configuration to Electron
through the agreed protocol.

## Current baseline

This repository is currently an Expo SDK 57 prototype, not yet an Expo Router
application:

- `App.js` is the current root;
- `components/avatar/AvatarScene.tsx` owns the initial preview screen;
- `lib/avatar/` contains the native asset, texture, GLTF, renderer, and VRM
  pipeline;
- `assets/models/` contains `Alcove.glb` and `lobsterEdit.vrm`;
- `assets/animations/` contains `idle_loop.vrma`;
- `metro.config.js` registers `vrm`, `glb`, and `vrma` assets and maps
  `expo-file-system` to its legacy entrypoint.

Do not write instructions as if planned `app/(setup)` and `app/(main)` routes,
Zustand, SecureStore, AsyncStorage, mDNS, or Wi-Fi modules already exist.
Introduce them incrementally and only when the feature needs them.

## Expo SDK 57 rules

The installed `package.json` and Expo SDK 57 documentation are authoritative:

- Expo SDK 57 targets React Native 0.86 and React 19.2.3;
- the minimum Node.js version is 22.13.x;
- use `npx expo install` for Expo-compatible packages;
- do not copy the old SDK 54 versions listed in the initial plan;
- check SDK 57 config-plugin and permission requirements before adding native
  packages.

Use Expo Router when the navigation foundation is actually introduced. Keep
layouts native, use file-based routes, and do not recreate Next.js routing.

Use the companion `expo-web-to-native` skill for migration sequencing and
`vercel-react-native-skills` for React Native performance and UI patterns. Use
`expo-dom` only when a specific Web-only screen needs a temporary bridge; do not
make it the architecture for the configuration app.

## Web-to-native migration

Follow an incremental migration, not a big-bang Web rewrite:

1. understand the Web behavior and target product scope;
2. classify the work as native UI, shared logic, or a temporary hybrid;
3. reuse types, validation, serialization, and domain rules;
4. redesign the screen with React Native/Expo primitives;
5. verify content and behavior on a real device.

Do not translate `div` to `View`, `span` to `Text`, and `button` to
`Pressable` mechanically. Use safe areas, keyboard handling, touch targets,
native navigation, sheets, haptics, and platform conventions. Prefer existing
Expo/native capabilities and installed project patterns before adding a
dependency. Use DOM Components only as a deliberate temporary bridge for a
specific Web-only screen; they are not the default for this configuration app.

For long lists use a virtualized list. Prefer `Pressable`, `StyleSheet.create`,
safe-area-aware scroll views, and native stack/tabs where appropriate. Keep
render work off the JS path when a native or worklet solution already exists.

## Avatar preview

The mobile avatar is a preview, not the Desktop renderer. It must not assume
Looking Glass, WebXR, browser canvas behavior, lip-sync, microphone capture,
or desktop speech execution.

Current native rendering flow:

```text
GLView.onContextCreate
  -> createExpoRenderer
  -> Three.js scene/camera/lights
  -> Asset/local URI resolution
  -> GLTFLoader + VRMLoaderPlugin
  -> native texture conversion
  -> VRMA AnimationMixer + VRM update
  -> renderer.render + gl.endFrameEXP
```

When changing it:

- retain the `GLView` lifecycle and dispose renderer/animation resources;
- preserve the local asset fallback and loading/error status;
- keep texture conversion and the fake-canvas bridge isolated in `lib/avatar`;
- account for Android/iOS GPU, memory, WebGL, and device-size differences;
- validate VRM/MToon behavior on a real device early;
- use a 2D or remote snapshot fallback only when native 3D is proven
  unavailable, not as speculative architecture.

Avoid debug logging per frame or logging model contents in production. Keep
the render loop bounded and do not add expensive React state updates per frame.

## Configuration and network boundary

The planned user flow is Wi-Fi/LAN discovery, connection to Electron, local
configuration, and initial/live sync. Current Electron code does not yet expose
the planned `/api/device-config` contract, mDNS service, or pairing flow.

Therefore:

- do not claim discovery or sync is implemented until the Electron endpoint
  and payload contract exist;
- keep the client transport typed and injectable so manual IP/token fallback is
  possible;
- handle timeout, unavailable desktop, network changes, retries, and malformed
  or incompatible payloads;
- version configuration payloads and ignore unknown fields on receipt;
- never log full payloads, API keys, Wi-Fi passwords, pairing secrets, or VRM
  contents.

`PLAN.md` currently describes storing provider credentials on Mobile and
sending them to Desktop, while `PLAN_DIRECTEUR.md` says credentials remain on
Desktop and are never re-emitted over LAN. This is an unresolved security
decision. Do not implement credential transfer until the contract is settled.
If credentials are eventually accepted on Mobile, use SecureStore rather than
AsyncStorage or ordinary app state and send them only over the explicitly
authenticated provisioning path.

Wi-Fi APIs are platform-specific and iOS does not generally permit arbitrary
programmatic network selection. Do not promise automatic Wi-Fi connection on
both platforms; provide a manual/system-settings fallback.

## Storage and forms

Separate ordinary configuration from secrets. Keep validation and serialization
in small typed modules, not inside screen components. Preserve the Web domain
rules for name, pronouns, personality, greeting, mood, hex color, provider
identifiers, and config versions without copying browser storage.

Use native document/file APIs for `.vrm` selection and persistence. Validate
file type/size before loading or uploading. Prefer the Desktop's existing VRM
reference contract when available instead of blindly transferring 5-50 MB
files.

## Dependencies and native configuration

Do not add a Web dependency merely because Web uses it. Check whether Expo SDK
57, React Native, or the existing Three.js pipeline already covers the need.
For each native dependency, use `npx expo install`, update `app.json` or a
config plugin when required, and verify Expo Go versus development-build
constraints.

## Verification

The minimum local checks are:

```bash
npm test
npm run typecheck
npx expo start --clear
```

Compilation is not enough. Run the changed screen on a real Android and iOS
device when it uses GL, file access, networking, permissions, keyboard
behavior, gestures, or platform UI. For 3D changes, verify loading, animation,
tint changes, cleanup, memory, and behavior after background/foreground.

Do not mark a Web-to-native feature complete until the native behavior is
verified against the Web reference and the target mobile UX is coherent.
