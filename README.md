# wasm-deploy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Zero-dependency WebAssembly deployment framework and Antigravity skill for compiling C, C++, Nim, and Rust projects into standalone single-file HTML applications with client-side `localStorage` persistence and a Libretro WebGL shader pipeline.

## Features

- **Self-Contained Single-File HTML**: Packages HTML, CSS, JavaScript, virtual filesystem assets, and base64-encoded WASM binaries into a single portable `.html` file.
- **Libretro GLSL Shader Presets**: Built-in WebGL multi-pass shader pipeline providing dropdown-selectable presets directly derived from [libretro/glsl-shaders](https://github.com/libretro/glsl-shaders/tree/master/presets):
  - **None (Crisp Pixels)**: 1:1 nearest-neighbor pass-through.
  - **CRT — Consumer Light (`crt-consumer-light.glslp`)**: Fast scanlines, beam width, curvature, convergence, and saturation.
  - **CRT — Geom Glow (`crt-Geom-glow.glslp`)**: Authentic CRT barrel distortion, aperture dot mask, and phosphor glow.
  - **CRT — Fakelottes NTSC Composite (`fakelottes-ntsc-composite.glslp`)**: NTSC composite chroma delay with Lottes scanlines.
  - **CRT — Guest Dr. Venom Kurozumi (`crt-guest-dr-venom-kurozumi.glslp`)**: High-end arcade Trinitron aperture grille and dynamic beam width.
  - **Handheld — Retro V2 + GBC Color (`retro-v2+gbc-color.glslp`)**: Game Boy Color reflective LCD color mangler and subpixel grid.
  - **Handheld — Retro V2 + GBA Color (`retro-v2+gba-color.glslp`)**: Game Boy Advance LCD color correction and pixel grid.
  - **Handheld — Retro V2 + Image Adjustment (`retro-v2+image-adjustment.glslp`)**: Fine LCD grid with contrast and gamma tuning.
  - **Vintage — Commodore 64 Monitor Fast (`c64-monitor-fast.glslp`)**: C64 composite smear and 1702/1084 phosphor tone.
  - **Arcade — Vector Glow (`vector-glow.glslp`)**: Kawase blur bloom for neon vector graphics.
  - **Scaler — ScaleFX AA Fast (`scalefx-aa-fast.glslp`)**: Subpixel edge gradient anti-aliasing.
- **Client-Side Persistence**: Synchronizes virtual in-memory filesystem paths and user settings (including active shader preset) to browser `localStorage`.
- **LAN Hub Deployment**: Deploys to `/var/www/apps/<project-name>/` served on port 80 across the local network.

## Directory Structure

- `SKILL.md`: Complete Antigravity skill reference and step-by-step deployment workflow.
- `tools/libretro-pipeline.js`: Reusable standalone WebGL Libretro shader pipeline class.
- `tools/wasm_shell.html`: Standard turnkey Emscripten shell template (`--shell-file tools/wasm_shell.html`) with embedded shader dropdown.
- `demo/index.html`: Interactive demo and test suite featuring live test patterns, shader presets, and parameter sliders.

## Usage

In any C/C++/Nim/Rust project, compile with:

```bash
emcc -O2 "${OBJECTS[@]}" \
    --shell-file tools/wasm_shell.html \
    -s SINGLE_FILE=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s FORCE_FILESYSTEM=1 \
    -s ENVIRONMENT=web \
    -o "build/<project-name>.html"
```
