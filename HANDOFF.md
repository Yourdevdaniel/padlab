# Passagem de trabalho (2026-11-09)

## Estado
- Repo privado `Yourdevdaniel/padlab`, branch `main`. CI no GitHub Actions (`.github/workflows/ci.yml`, windows-latest): `npm ci`, `npm run build`, `cargo test`, `npx tauri build`, instalador NSIS como artefato.
- Primeira CI falhou em `cargo test` com 2 erros de compilação; corrigidos no commit "Corrige o build na CI" (`matches!` no `BusType`, feature `Devices_Power` para `TryGetBatteryReport`). CI desse commit (run 42644638805) **verde**: compila, os testes do Rust passam e o instalador sai como artefato `PadLab-instalador`. Ainda não foi testado com controle de verdade (o instalador também é barrado pelo Smart App Control neste PC).
- O PC do dono tem o **Smart App Control ligado**: bloqueia scripts de build do Rust e binários sem reputação. Nada de Rust compila localmente; use a CI. `rolldown` fixo em 1.2.12 (`overrides`) pelo mesmo motivo.

## Pendências, em ordem
1. **Testar com controle real** (DualSense, DS4, Xbox) num PC sem Smart App Control. Se algo falhar no Xbox, os pontos menos certos são `src-tauri/src/xbox.rs` (API do crate `windows` 0.62: `Gamepad::Gamepads`, `GamepadButtons(..).0`, `GamepadReading: Default`, `Gamepad: Send`, comparação `&x == g`) e o `RoInitialize` em `lib.rs`.
2. **Controle no preview do navegador** (`npm run dev` no Edge): hoje não acha controle porque a leitura é só do lado Rust. Plano: quando `!('__TAURI_INTERNALS__' in window)`, ler DualSense/DS4 por WebHID (portar `dualsense.rs`/`ds4.rs` para TS; `Desktop\Projetos\dualsense-tester\index.html` tem um DualSense via WebHID que funciona) e Xbox pela Gamepad API (`vibrationActuator.playEffect('dual-rumble' | 'trigger-rumble')`). Precisa de um botão "Conectar" (WebHID pede gesto do usuário).
3. **Modelos 3D.** O dono achou o modelo de primitivas feio. Ele vai gerar `public/models/{dualsense,dualshock4,xbox}.glb` por um script do Blender com nomes de nós fixos: `body`, `btn_cross|circle|square|triangle`, `dpad_up|down|left|right`, `l1`, `r1`, `l2`, `r2` (pivô na dobradiça), `stick_l`, `stick_r` (pivô na base), `btn_create`, `btn_options`, `btn_ps`, `touchpad`, `btn_mute`, `lightbar` (material "lightbar"), `led_1..5` (material "player_led"). Trocar `src/model.ts` por um `GLTFLoader` que anima por esses nomes, mantendo a API `createScene` (`update`, `kick`, `setKind`).

## Mapa
- `src-tauri/src/`: `device.rs` (tipos comuns), `dualsense.rs`, `ds4.rs`, `xbox.rs`, `lib.rs` (thread de leitura, comandos `set_output` e `hello`, eventos `pad` e `pad-info`).
- `src/`: `main.ts` (painéis, abas, saída), `model.ts` (3D), `effects.ts` (animações dos gatilhos), `pad.ts` (tipos, capacidades por controle), `keyboard.ts`, `mouse.ts`, `audio.ts`.
- Commits sem rodapé de atribuição nem link de sessão (regra do dono).
