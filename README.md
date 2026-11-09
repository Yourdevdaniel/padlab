# PadLab

App de desktop (Tauri 2 + Rust + three.js) para ver o estado e testar controles, teclado, mouse e áudio.

## O que testa

**Controles**, achados sozinhos pelo cabo ou pelo Bluetooth:

| | DualSense / Edge | DualShock 4 | Xbox One / Series / Elite |
|---|---|---|---|
| Botões, analógicos, gatilhos | ✓ | ✓ | ✓ |
| Bateria e carregamento | ✓ | ✓ | ✓ (sem fio) |
| Touchpad, giroscópio, acelerômetro | ✓ | ✓ | — |
| Barra de luz | ✓ | ✓ | — |
| LEDs de jogador, luz do mudo | ✓ | — | — |
| Vibração | ✓ | ✓ | ✓ |
| Gatilhos adaptáveis | ✓ | — | — |
| Motores nos gatilhos | — | — | ✓ |
| MAC e firmware | ✓ | ✓ | — |

Drift e circularidade dos analógicos, contagem de apertos (com detecção de repique) e um controle 3D que acompanha tudo. Cada efeito de gatilho tem uma animação (metralhadora, pistola, arco, molas); no Xbox ela pulsa os motores dos gatilhos.

**Teclado** (layout ABNT2): teclas testadas, rollover e repique. **Mouse**: cinco botões, roda nos dois eixos, repique, taxa de atualização e bateria dos aparelhos Bluetooth conectados (a mesma que o Windows mostra em Configurações; pelo receptor 2.4 GHz cada marca usa um protocolo próprio e o Windows não recebe a bateria). **Áudio**: tom no lado esquerdo e direito, varredura de 20 Hz a 20 kHz, nível e espectro do microfone, gravar e ouvir.

## Como funciona

- `src-tauri/src/dualsense.rs` e `ds4.rs`: decodificam os relatórios HID dos controles da Sony e montam os relatórios de saída (com o CRC32 do Bluetooth). Offsets do driver `hid-playstation` do Linux.
- `src-tauri/src/xbox.rs`: controles Xbox pelo Windows.Gaming.Input, a única API que chega aos motores dos gatilhos.
- `src-tauri/src/lib.rs`: procura um controle, lê numa thread e manda os quadros para a janela.
- `src/`: a interface (TypeScript, sem framework). `model.ts` é o controle 3D, `effects.ts` as animações dos gatilhos.

## Rodar

```
npm install
npm run tauri dev
```

Precisa do Rust e das Build Tools do Visual Studio (C++). A interface sozinha abre com `npm run dev`, mas sem controle (a leitura é do lado Rust).

**Smart App Control.** Com o Smart App Control do Windows ligado, a compilação do Rust é bloqueada ("Uma política de Controle de Aplicativo bloqueou este arquivo"): ele não deixa rodar os scripts de build que o Rust gera. Por isso o build e os testes rodam no GitHub Actions (`.github/workflows/ci.yml`), que deixa o instalador como artefato. O `rolldown` está fixo em 1.2.12 (`overrides` no `package.json`) porque a versão mais nova ainda não tem reputação e também era bloqueada.
