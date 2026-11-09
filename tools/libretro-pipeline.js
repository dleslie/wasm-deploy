/**
 * Libretro WebGL Shader Pipeline
 *
 * Implements high-performance multi-pass shader rendering modeled after
 * the Libretro/RetroArch GLSL shader pipeline (.glslp specification):
 * https://github.com/libretro/glsl-shaders/tree/master/presets
 *
 * Designed for zero-dependency standalone WebAssembly web applications
 * deployed via Antigravity wasm-deploy.
 *
 * Author: Dan Leslie <dan@ironoxide.ca>
 */

(function (global) {
  "use strict";

  // Fullscreen quad positions and texcoords
  // Pass 0 (samples sourceTexture where V=0 is top):
  var QUAD_SOURCE = new Float32Array([
    // X,     Y,     U,   V,   origU, origV
    -1.0,  1.0,   0.0, 0.0,   0.0, 0.0,
     1.0,  1.0,   1.0, 0.0,   1.0, 0.0,
    -1.0, -1.0,   0.0, 1.0,   0.0, 1.0,
     1.0, -1.0,   1.0, 1.0,   1.0, 1.0
  ]);

  // Pass 1+ (samples FBO texture where V=1 is top):
  var QUAD_FBO = new Float32Array([
    // X,     Y,     U,   V,   origU, origV
    -1.0,  1.0,   0.0, 1.0,   0.0, 0.0,
     1.0,  1.0,   1.0, 1.0,   1.0, 0.0,
    -1.0, -1.0,   0.0, 0.0,   0.0, 1.0,
     1.0, -1.0,   1.0, 0.0,   1.0, 1.0
  ]);

  var DEFAULT_VERTEX_SHADER = [
    "attribute vec2 VertexCoord;",
    "attribute vec2 TexCoord;",
    "attribute vec2 OrigTexCoord;",
    "uniform mat4 MVPMatrix;",
    "varying vec2 vTexCoord;",
    "varying vec2 vOrigCoord;",
    "varying vec4 TEX0;",
    "void main() {",
    "    gl_Position = MVPMatrix * vec4(VertexCoord, 0.0, 1.0);",
    "    vTexCoord = TexCoord;",
    "    vOrigCoord = OrigTexCoord;",
    "    TEX0 = vec4(TexCoord, 0.0, 1.0);",
    "}"
  ].join("\n");

  var PRECISION_HEADER = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif"
  ].join("\n");

  var PASSTHROUGH_FRAGMENT_SHADER = [
    PRECISION_HEADER,
    "uniform sampler2D Texture;",
    "varying vec2 vTexCoord;",
    "void main() {",
    "    gl_FragColor = texture2D(Texture, vTexCoord);",
    "}"
  ].join("\n");

  // =========================================================================
  // LIBRETRO SHADER PRESET DEFINITIONS
  // Derived directly from https://github.com/libretro/glsl-shaders/tree/master/presets
  // =========================================================================

  var PRESET_DEFINITIONS = {
    // -----------------------------------------------------------------------
    // None / Pass-through (Crisp Pixels)
    // -----------------------------------------------------------------------
    "none": {
      name: "None (Crisp Pixels)",
      category: "Default",
      passes: [
        {
          fragment: PASSTHROUGH_FRAGMENT_SHADER,
          filter_linear: false,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {}
    },

    // -----------------------------------------------------------------------
    // CRT - Consumer Light (presets/crt-consumer-light.glslp)
    // -----------------------------------------------------------------------
    "crt-consumer-light": {
      name: "CRT — Consumer Light",
      category: "CRT",
      passes: [
        {
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "uniform vec2 InputSize;",
            "uniform int FrameCount;",
            "uniform float WARP;",
            "uniform float SCANLINE;",
            "uniform float MASK;",
            "uniform float COL_GAIN;",
            "uniform float U_SAT;",
            "uniform float U_CONVERG;",
            "varying vec2 vTexCoord;",
            "",
            "vec2 warpDistort(vec2 pos, float amount) {",
            "    vec2 c = pos - 0.5;",
            "    return pos + c * dot(c, c) * amount;",
            "}",
            "",
            "void main() {",
            "    vec2 pos = warpDistort(vTexCoord, WARP * 0.15);",
            "    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) {",
            "        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);",
            "        return;",
            "    }",
            "    float shift = U_CONVERG * 0.8 / TextureSize.x;",
            "    vec3 col;",
            "    col.r = texture2D(Texture, vec2(pos.x - shift, pos.y)).r;",
            "    col.g = texture2D(Texture, pos).g;",
            "    col.b = texture2D(Texture, vec2(pos.x + shift, pos.y)).b;",
            "",
            "    // Authentic horizontal scanlines (cosine beam profile centered on each scanline)",
            "    float scanFrac = fract(pos.y * InputSize.y) - 0.5;",
            "    float scan = cos(scanFrac * 3.14159265);",
            "    col *= mix(1.0 - SCANLINE * 0.70, 1.05, scan);",
            "",
            "    // Phosphor triad dot mask (RGB triads across screen pixels)",
            "    float maskIdx = mod(floor(pos.x * OutputSize.x), 3.0);",
            "    vec3 mask = vec3(1.0 - MASK * 0.4);",
            "    if (maskIdx < 1.0) mask.r = 1.0 + MASK * 0.35;",
            "    else if (maskIdx < 2.0) mask.g = 1.0 + MASK * 0.35;",
            "    else mask.b = 1.0 + MASK * 0.35;",
            "    col *= mask;",
            "",
            "    // Saturation and gain boost",
            "    float luma = dot(col, vec3(0.299, 0.587, 0.114));",
            "    col = mix(vec3(luma), col, U_SAT) * COL_GAIN;",
            "    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        WARP: 0.12,
        SCANLINE: 0.45,
        MASK: 0.22,
        COL_GAIN: 1.25,
        U_SAT: 1.2,
        U_CONVERG: 0.6
      }
    },

    // -----------------------------------------------------------------------
    // CRT - Geom Glow (presets/crt-Geom-glow.glslp)
    // -----------------------------------------------------------------------
    "crt-geom-glow": {
      name: "CRT — Geom Glow",
      category: "CRT",
      passes: [
        {
          // Pass 0: Horizontal glow / bloom blur
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 TextureSize;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec2 dx = vec2(1.2 / TextureSize.x, 0.0);",
            "    vec3 c = texture2D(Texture, vTexCoord).rgb * 0.38;",
            "    c += (texture2D(Texture, vTexCoord - dx).rgb + texture2D(Texture, vTexCoord + dx).rgb) * 0.24;",
            "    c += (texture2D(Texture, vTexCoord - dx * 2.0).rgb + texture2D(Texture, vTexCoord + dx * 2.0).rgb) * 0.07;",
            "    gl_FragColor = vec4(c, 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "source",
          scale: 1.0
        },
        {
          // Pass 1: CRT-Geom barrel curvature, scanlines and aperture mask
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "uniform float CURVATURE;",
            "uniform float DOTMASK;",
            "uniform float scanline_weight;",
            "uniform float CRTgamma;",
            "varying vec2 vTexCoord;",
            "",
            "vec2 geomWarp(vec2 uv) {",
            "    vec2 c = uv - 0.5;",
            "    float r2 = dot(c, c);",
            "    return uv + c * (r2 * 0.18 + r2 * r2 * 0.06) * CURVATURE;",
            "}",
            "",
            "void main() {",
            "    vec2 pos = geomWarp(vTexCoord);",
            "    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) {",
            "        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);",
            "        return;",
            "    }",
            "    vec3 color = pow(texture2D(Texture, pos).rgb, vec3(CRTgamma));",
            "",
            "    // Authentic horizontal scanline profile along Y",
            "    float scanFrac = fract(pos.y * InputSize.y) - 0.5;",
            "    float scanDist = scanFrac * scanFrac;",
            "    float scanFactor = exp(-scanDist / (scanline_weight * 0.18));",
            "    color *= mix(1.0 - 0.45 * scanline_weight, 1.08, scanFactor);",
            "",
            "    // Subtle aperture dot mask",
            "    float m = mod(floor(pos.x * OutputSize.x), 2.0);",
            "    color *= (m < 1.0) ? (1.0 - DOTMASK * 0.15) : (1.0 + DOTMASK * 0.12);",
            "",
            "    // Vignette / screen border falloff",
            "    vec2 vignette = clamp((0.5 - abs(pos - 0.5)) * 25.0, 0.0, 1.0);",
            "    color *= vignette.x * vignette.y;",
            "",
            "    gl_FragColor = vec4(pow(clamp(color * 1.15, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        CURVATURE: 1.0,
        DOTMASK: 0.35,
        scanline_weight: 0.32,
        CRTgamma: 2.2
      }
    },

    // -----------------------------------------------------------------------
    // CRT - Fakelottes NTSC Composite (presets/fakelottes-ntsc-composite.glslp)
    // -----------------------------------------------------------------------
    "fakelottes-ntsc-composite": {
      name: "CRT — Fakelottes NTSC Composite",
      category: "CRT",
      passes: [
        {
          // Pass 0: NTSC composite chroma delay / fringe
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 TextureSize;",
            "uniform float u_chroma;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    float dx = 1.0 / TextureSize.x;",
            "    vec4 c0 = texture2D(Texture, vTexCoord);",
            "    vec4 cL = texture2D(Texture, vTexCoord - vec2(dx * u_chroma * 0.8, 0.0));",
            "    vec4 cR = texture2D(Texture, vTexCoord + vec2(dx * u_chroma * 0.8, 0.0));",
            "    vec3 ntsc;",
            "    ntsc.r = cL.r * 0.65 + c0.r * 0.35;",
            "    ntsc.g = c0.g * 0.80 + (cL.g + cR.g) * 0.10;",
            "    ntsc.b = cR.b * 0.70 + c0.b * 0.30;",
            "    gl_FragColor = vec4(ntsc, 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "source",
          scale: 1.0
        },
        {
          // Pass 1: Lottes scanlines + shadow mask + curvature
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "uniform float warpX;",
            "uniform float warpY;",
            "uniform float SCANLINE_SINE_COMP_B;",
            "varying vec2 vTexCoord;",
            "",
            "vec2 warp(vec2 uv) {",
            "    vec2 c = uv - 0.5;",
            "    uv.x += c.x * c.y * c.y * warpX * 4.0;",
            "    uv.y += c.y * c.x * c.x * warpY * 4.0;",
            "    return uv;",
            "}",
            "",
            "void main() {",
            "    vec2 pos = warp(vTexCoord);",
            "    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) {",
            "        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);",
            "        return;",
            "    }",
            "    vec3 col = texture2D(Texture, pos).rgb;",
            "    // Authentic horizontal scanlines along Y",
            "    float scanFrac = fract(pos.y * InputSize.y) - 0.5;",
            "    float scan = cos(scanFrac * 3.14159265);",
            "    col *= mix(1.0 - SCANLINE_SINE_COMP_B * 0.70, 1.05, scan);",
            "",
            "    // Subtle triad shadow mask across screen pixels",
            "    float mask = mod(floor(pos.x * OutputSize.x), 3.0);",
            "    vec3 m = vec3(0.95);",
            "    if (mask < 1.0) m.r = 1.05; else if (mask < 2.0) m.g = 1.05; else m.b = 1.05;",
            "    col *= m;",
            "    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        u_chroma: 1.8,
        warpX: 0.035,
        warpY: 0.045,
        SCANLINE_SINE_COMP_B: 0.38
      }
    },

    // -----------------------------------------------------------------------
    // CRT - Kurozumi / Guest Dr. Venom (presets/crt-guest-dr-venom-kurozumi.glslp)
    // -----------------------------------------------------------------------
    "crt-guest-kurozumi": {
      name: "CRT — Guest Dr. Venom Kurozumi",
      category: "CRT",
      passes: [
        {
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "uniform float beam_min;",
            "uniform float beam_max;",
            "uniform float mask_dark;",
            "uniform float mask_light;",
            "uniform float crt_gamma;",
            "varying vec2 vTexCoord;",
            "",
            "void main() {",
            "    vec2 uv = vTexCoord;",
            "    vec3 src = pow(texture2D(Texture, uv).rgb, vec3(crt_gamma));",
            "    float brightness = dot(src, vec3(0.299, 0.587, 0.114));",
            "",
            "    // Adaptive horizontal scanline beam along Y",
            "    float beamWidth = mix(beam_min, beam_max, brightness) * 0.08;",
            "    float scanPos = fract(uv.y * InputSize.y) - 0.5;",
            "    float scanDist = scanPos * scanPos;",
            "    float beam = exp(-scanDist / beamWidth);",
            "    vec3 col = src * mix(0.48, 1.10, beam);",
            "",
            "    // Trinitron-style subtle aperture grille mask across screen pixels",
            "    float triad = mod(floor(uv.x * OutputSize.x), 3.0);",
            "    vec3 mask = vec3(mask_dark * 0.35 + 0.65);",
            "    if (triad < 1.0) mask.r = mask_light * 0.25 + 0.75;",
            "    else if (triad < 2.0) mask.g = mask_light * 0.25 + 0.75;",
            "    else mask.b = mask_light * 0.25 + 0.75;",
            "    col *= mask;",
            "",
            "    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        beam_min: 1.2,
        beam_max: 2.8,
        mask_dark: 0.65,
        mask_light: 1.35,
        crt_gamma: 2.4
      }
    },

    // -----------------------------------------------------------------------
    // Handheld - Retro V2 + GBC Color (presets/retro-v2+gbc-color.glslp)
    // -----------------------------------------------------------------------
    "retro-v2+gbc-color": {
      name: "Handheld — Retro V2 + GBC Color",
      category: "Handheld",
      passes: [
        {
          // Pass 0: GBC Color Mangler Matrix
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform float lighten_screen;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec4 screen = pow(texture2D(Texture, vTexCoord), vec4(2.2 - lighten_screen * 0.8));",
            "    mat4 colorMat = mat4(",
            "        0.82, 0.125, 0.195, 0.0,",
            "        0.24, 0.665, 0.075, 0.0,",
            "       -0.06, 0.21,  0.73,  0.0,",
            "        0.0,  0.0,   0.0,   1.0",
            "    );",
            "    screen = clamp(screen * 0.94, 0.0, 1.0);",
            "    screen = colorMat * screen;",
            "    gl_FragColor = pow(clamp(screen, 0.0, 1.0), vec4(1.0 / 2.2));",
            "}"
          ].join("\n"),
          filter_linear: false,
          scale_type: "source",
          scale: 1.0
        },
        {
          // Pass 1: Retro-V2 Pixel Grid (Hyllian)
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 InputSize;",
            "uniform float RETRO_PIXEL_SIZE;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec3 c = pow(texture2D(Texture, vTexCoord).rgb, vec3(2.4));",
            "    vec2 fp = fract(vTexCoord * InputSize);",
            "    vec2 ps = InputSize / OutputSize;",
            "    vec2 f = clamp(clamp(fp + 0.5 * ps, 0.0, 1.0) - RETRO_PIXEL_SIZE, vec2(0.0), ps) / ps;",
            "    float maxCoord = max(f.x, f.y);",
            "    vec3 res = mix(c * (1.04 + fp.x * fp.y), c * 0.36, maxCoord);",
            "    gl_FragColor = vec4(clamp(pow(res, vec3(1.0 / 2.2)), 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: false,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        lighten_screen: 0.85,
        RETRO_PIXEL_SIZE: 0.84
      }
    },

    // -----------------------------------------------------------------------
    // Handheld - Retro V2 + GBA Color (presets/retro-v2+gba-color.glslp)
    // -----------------------------------------------------------------------
    "retro-v2+gba-color": {
      name: "Handheld — Retro V2 + GBA Color",
      category: "Handheld",
      passes: [
        {
          // Pass 0: GBA LCD Color Matrix
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform float darken_screen;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec4 screen = pow(texture2D(Texture, vTexCoord), vec4(2.2 + darken_screen * 0.5));",
            "    mat4 colorMat = mat4(",
            "        0.84, 0.09, 0.16, 0.0,",
            "        0.18, 0.72, 0.09, 0.0,",
            "       -0.04, 0.16, 0.78, 0.0,",
            "        0.0,  0.0,  0.0,  1.0",
            "    );",
            "    screen = clamp(screen * 0.96, 0.0, 1.0);",
            "    screen = colorMat * screen;",
            "    gl_FragColor = pow(clamp(screen, 0.0, 1.0), vec4(1.0 / 2.2));",
            "}"
          ].join("\n"),
          filter_linear: false,
          scale_type: "source",
          scale: 1.0
        },
        {
          // Pass 1: Retro-V2 Pixel Grid
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 InputSize;",
            "uniform float RETRO_PIXEL_SIZE;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec3 c = pow(texture2D(Texture, vTexCoord).rgb, vec3(2.4));",
            "    vec2 fp = fract(vTexCoord * InputSize);",
            "    vec2 ps = InputSize / OutputSize;",
            "    vec2 f = clamp(clamp(fp + 0.5 * ps, 0.0, 1.0) - RETRO_PIXEL_SIZE, vec2(0.0), ps) / ps;",
            "    float maxCoord = max(f.x, f.y);",
            "    vec3 res = mix(c * (1.04 + fp.x * fp.y), c * 0.40, maxCoord);",
            "    gl_FragColor = vec4(clamp(pow(res, vec3(1.0 / 2.2)), 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: false,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        darken_screen: 0.65,
        RETRO_PIXEL_SIZE: 0.82
      }
    },

    // -----------------------------------------------------------------------
    // Handheld - Retro V2 + Image Adjustment (presets/retro-v2+image-adjustment.glslp)
    // -----------------------------------------------------------------------
    "retro-v2+image-adjustment": {
      name: "Handheld — Retro V2 + Image Adjustment",
      category: "Handheld",
      passes: [
        {
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 InputSize;",
            "uniform float RETRO_PIXEL_SIZE;",
            "uniform float sat_boost;",
            "uniform float contrast_boost;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec3 c = texture2D(Texture, vTexCoord).rgb;",
            "    // Adjust contrast & saturation",
            "    c = (c - 0.5) * contrast_boost + 0.5;",
            "    float luma = dot(c, vec3(0.299, 0.587, 0.114));",
            "    c = mix(vec3(luma), c, sat_boost);",
            "",
            "    // Retro LCD grid lines",
            "    vec2 fp = fract(vTexCoord * InputSize);",
            "    vec2 ps = InputSize / OutputSize;",
            "    vec2 f = clamp(clamp(fp + 0.5 * ps, 0.0, 1.0) - RETRO_PIXEL_SIZE, vec2(0.0), ps) / ps;",
            "    float grid = max(f.x, f.y);",
            "    c = mix(c, c * 0.38, grid);",
            "    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: false,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        RETRO_PIXEL_SIZE: 0.85,
        sat_boost: 1.15,
        contrast_boost: 1.08
      }
    },

    // -----------------------------------------------------------------------
    // Vintage - C64 Monitor Fast (presets/c64-monitor-fast.glslp)
    // -----------------------------------------------------------------------
    "c64-monitor-fast": {
      name: "Vintage — Commodore 64 Monitor Fast",
      category: "Vintage",
      passes: [
        {
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "uniform float luma_delay;",
            "uniform float scan_line;",
            "uniform float phosphor_tint;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    float dx = 1.0 / TextureSize.x;",
            "    vec3 c0 = texture2D(Texture, vTexCoord).rgb;",
            "    vec3 cL = texture2D(Texture, vTexCoord - vec2(dx * luma_delay, 0.0)).rgb;",
            "",
            "    // C64 composite luma-chroma smear",
            "    vec3 c = mix(c0, cL, 0.35);",
            "",
            "    // Authentic Commodore 1702 CRT raster horizontal scanlines",
            "    float scanFrac = fract(vTexCoord.y * InputSize.y) - 0.5;",
            "    float scan = cos(scanFrac * 3.14159265);",
            "    c *= mix(1.0 - scan_line * 0.70, 1.05, scan);",
            "",
            "    // Commodore 1702 CRT phosphor tone",
            "    c.r *= 1.0 + phosphor_tint * 0.05;",
            "    c.g *= 1.0 + phosphor_tint * 0.02;",
            "    c.b *= 1.0 - phosphor_tint * 0.04;",
            "",
            "    // Subtle slot mask across screen pixels",
            "    float slot = mod(floor(vTexCoord.x * OutputSize.x), 2.0);",
            "    c *= (slot < 1.0) ? 0.96 : 1.04;",
            "",
            "    gl_FragColor = vec4(clamp(c * 1.12, 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        luma_delay: 1.4,
        scan_line: 0.42,
        phosphor_tint: 1.2
      }
    },

    // -----------------------------------------------------------------------
    // Arcade - Vector Glow (presets/vector-glow.glslp)
    // -----------------------------------------------------------------------
    "vector-glow": {
      name: "Arcade — Vector Glow",
      category: "Arcade",
      passes: [
        {
          // Pass 0: High-pass extraction of vector neon lines
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 TextureSize;",
            "varying vec2 vTexCoord;",
            "void main() {",
            "    vec3 col = texture2D(Texture, vTexCoord).rgb;",
            "    float luma = dot(col, vec3(0.299, 0.587, 0.114));",
            "    // Only extract bright vector lines and highlights for bloom",
            "    float bloomWeight = smoothstep(0.55, 0.90, luma);",
            "    gl_FragColor = vec4(col * bloomWeight, 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "source",
          scale: 0.5
        },
        {
          // Pass 1: Crisp original + tight vector neon halo
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform sampler2D OrigTexture;",
            "uniform vec2 TextureSize;",
            "uniform float glow_intensity;",
            "varying vec2 vTexCoord;",
            "varying vec2 vOrigCoord;",
            "void main() {",
            "    // Sharp original pixels remain completely crisp and unblurred!",
            "    vec3 base = texture2D(OrigTexture, vOrigCoord).rgb;",
            "    // Sample tight 9-tap gaussian bloom of bright highlights",
            "    vec2 d = 2.0 / TextureSize;",
            "    vec3 bloom = texture2D(Texture, vTexCoord).rgb * 0.28;",
            "    bloom += (texture2D(Texture, vTexCoord + vec2(-d.x, 0.0)).rgb + texture2D(Texture, vTexCoord + vec2(d.x, 0.0)).rgb) * 0.18;",
            "    bloom += (texture2D(Texture, vTexCoord + vec2(0.0, -d.y)).rgb + texture2D(Texture, vTexCoord + vec2(0.0, d.y)).rgb) * 0.18;",
            "    bloom += (texture2D(Texture, vTexCoord + vec2(-d.x, -d.y)).rgb + texture2D(Texture, vTexCoord + vec2(d.x, d.y)).rgb) * 0.09;",
            "    bloom += (texture2D(Texture, vTexCoord + vec2(d.x, -d.y)).rgb + texture2D(Texture, vTexCoord + vec2(-d.x, d.y)).rgb) * 0.09;",
            "",
            "    // Vector additive bloom synthesis",
            "    vec3 finalColor = base + bloom * (glow_intensity * 0.65);",
            "    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {
        glow_intensity: 1.0
      }
    },

    // -----------------------------------------------------------------------
    // Scaler - ScaleFX AA Fast (presets/scalefx-aa-fast.glslp)
    // -----------------------------------------------------------------------
    "scalefx-aa-fast": {
      name: "Scaler — ScaleFX AA Fast",
      category: "Anti-Aliasing",
      passes: [
        {
          fragment: [
            PRECISION_HEADER,
            "uniform sampler2D Texture;",
            "uniform vec2 OutputSize;",
            "uniform vec2 TextureSize;",
            "varying vec2 vTexCoord;",
            "",
            "void main() {",
            "    vec2 dx = vec2(1.0 / TextureSize.x, 0.0);",
            "    vec2 dy = vec2(0.0, 1.0 / TextureSize.y);",
            "    vec3 c0 = texture2D(Texture, vTexCoord).rgb;",
            "    vec3 cU = texture2D(Texture, vTexCoord - dy).rgb;",
            "    vec3 cD = texture2D(Texture, vTexCoord + dy).rgb;",
            "    vec3 cL = texture2D(Texture, vTexCoord - dx).rgb;",
            "    vec3 cR = texture2D(Texture, vTexCoord + dx).rgb;",
            "",
            "    // Subpixel edge gradient detection",
            "    vec2 uvFrac = fract(vTexCoord * TextureSize) - 0.5;",
            "    float lumaCenter = dot(c0, vec3(0.299, 0.587, 0.114));",
            "    float lumaU = dot(cU, vec3(0.299, 0.587, 0.114));",
            "    float lumaD = dot(cD, vec3(0.299, 0.587, 0.114));",
            "    float lumaL = dot(cL, vec3(0.299, 0.587, 0.114));",
            "    float lumaR = dot(cR, vec3(0.299, 0.587, 0.114));",
            "",
            "    vec2 grad = vec2(lumaR - lumaL, lumaD - lumaU);",
            "    float edge = length(grad);",
            "    if (edge > 0.08) {",
            "        vec2 dir = normalize(grad);",
            "        vec3 sample1 = texture2D(Texture, vTexCoord - dir * dx.x * 0.45).rgb;",
            "        vec3 sample2 = texture2D(Texture, vTexCoord + dir * dx.x * 0.45).rgb;",
            "        c0 = mix(c0, (sample1 + sample2) * 0.5, clamp(edge * 1.5, 0.0, 0.65));",
            "    }",
            "    gl_FragColor = vec4(c0, 1.0);",
            "}"
          ].join("\n"),
          filter_linear: true,
          scale_type: "viewport",
          scale: 1.0
        }
      ],
      parameters: {}
    }
  };

  // =========================================================================
  // PIPELINE IMPLEMENTATION
  // =========================================================================

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("GLSL Shader Compilation Failed: " + err);
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var err = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("GLSL Program Link Failed: " + err);
    }
    return prog;
  }

  function LibretroShaderPipeline(canvas, options) {
    options = options || {};
    this.canvas = canvas;
    this.storageKey = options.storageKey || "wasm-deploy:shader_preset";
    this.currentPresetId = "none";
    this.frameCount = 0;
    this.activeParameters = {};

    // WebGL Context setup
    var ctxAttribs = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true
    };
    var gl = canvas.getContext("webgl", ctxAttribs) || canvas.getContext("experimental-webgl", ctxAttribs);
    if (!gl) {
      console.warn("WebGL not supported; falling back to basic 2D rendering");
      this.gl = null;
      return;
    }
    this.gl = gl;

    // Fullscreen quad buffers:
    // Pass 0 samples sourceTexture (UNPACK_FLIP_Y=false, V=0 is top)
    this.quadBufferSource = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBufferSource);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_SOURCE, gl.STATIC_DRAW);

    // Pass 1+ samples FBO texture (OpenGL coordinate space, V=1 is top)
    this.quadBufferFBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBufferFBO);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_FBO, gl.STATIC_DRAW);

    // Source texture
    this.sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.sourceWidth = 0;
    this.sourceHeight = 0;

    // FBO pool for multi-pass presets
    this.fboPool = [];

    // Compile programs cache
    this.compiledPasses = [];

    // Check localStorage for saved preset
    var initialPreset = options.defaultPreset || "crt-consumer-light";
    try {
      if (typeof localStorage !== "undefined") {
        var saved = localStorage.getItem(this.storageKey);
        if (saved && PRESET_DEFINITIONS[saved]) {
          initialPreset = saved;
        }
      }
    } catch (e) {}

    this.setPreset(initialPreset);
  }

  LibretroShaderPipeline.PRESETS = PRESET_DEFINITIONS;

  LibretroShaderPipeline.PRESET_LIST = Object.keys(PRESET_DEFINITIONS).map(function (k) {
    return {
      id: k,
      name: PRESET_DEFINITIONS[k].name,
      category: PRESET_DEFINITIONS[k].category
    };
  });

  LibretroShaderPipeline.prototype.setPreset = function (presetId) {
    if (!PRESET_DEFINITIONS[presetId]) {
      console.warn("Unknown shader preset: " + presetId + ", defaulting to 'none'");
      presetId = "none";
    }
    var preset = PRESET_DEFINITIONS[presetId];
    this.currentPresetId = presetId;
    this.activeParameters = Object.assign({}, preset.parameters || {});

    // Persist choice
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.storageKey, presetId);
      }
    } catch (e) {}

    if (!this.gl) return;
    var gl = this.gl;

    try {
      // Compile passes for this preset
      var newPasses = [];
      for (var i = 0; i < preset.passes.length; i++) {
        var passDef = preset.passes[i];
        var vsSrc = passDef.vertex || DEFAULT_VERTEX_SHADER;
        var fsSrc = passDef.fragment;
        var prog = createProgram(gl, vsSrc, fsSrc);

        var passObj = {
          program: prog,
          filter_linear: passDef.filter_linear !== false,
          scale_type: passDef.scale_type || "viewport",
          scale: passDef.scale || 1.0,
          attribs: {
            VertexCoord: gl.getAttribLocation(prog, "VertexCoord"),
            TexCoord: gl.getAttribLocation(prog, "TexCoord"),
            OrigTexCoord: gl.getAttribLocation(prog, "OrigTexCoord")
          },
          uniforms: {
            MVPMatrix: gl.getUniformLocation(prog, "MVPMatrix"),
            Texture: gl.getUniformLocation(prog, "Texture"),
            OrigTexture: gl.getUniformLocation(prog, "OrigTexture"),
            OutputSize: gl.getUniformLocation(prog, "OutputSize"),
            TextureSize: gl.getUniformLocation(prog, "TextureSize"),
            InputSize: gl.getUniformLocation(prog, "InputSize"),
            OrigInputSize: gl.getUniformLocation(prog, "OrigInputSize"),
            FrameCount: gl.getUniformLocation(prog, "FrameCount"),
            FrameDirection: gl.getUniformLocation(prog, "FrameDirection")
          },
          paramUniforms: {}
        };

        // Map parameter uniforms
        var allParamKeys = Object.keys(this.activeParameters);
        for (var p = 0; p < allParamKeys.length; p++) {
          var pName = allParamKeys[p];
          var loc = gl.getUniformLocation(prog, pName);
          if (loc !== null) {
            passObj.paramUniforms[pName] = loc;
          }
        }

        newPasses.push(passObj);
      }
      this.compiledPasses = newPasses;
    } catch (compileErr) {
      console.warn("Failed to compile preset '" + presetId + "':", compileErr);
      if (presetId !== "none") {
        console.warn("Falling back to preset 'none'");
        this.setPreset("none");
      }
    }
  };

  LibretroShaderPipeline.prototype.setParameter = function (name, value) {
    this.activeParameters[name] = parseFloat(value);
  };

  LibretroShaderPipeline.prototype.getParameter = function (name) {
    return this.activeParameters[name];
  };

  LibretroShaderPipeline.prototype.getParameters = function () {
    return Object.assign({}, this.activeParameters);
  };

  LibretroShaderPipeline.prototype._ensureFBO = function (index, width, height) {
    var gl = this.gl;
    while (this.fboPool.length <= index) {
      var fbo = gl.createFramebuffer();
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.fboPool.push({ fbo: fbo, texture: tex, width: 0, height: 0 });
    }

    var entry = this.fboPool[index];
    if (entry.width !== width || entry.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, entry.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, entry.texture, 0);
      entry.width = width;
      entry.height = height;
    }
    return entry;
  };

  /**
   * Upload and render a frame through the Libretro Shader Pipeline.
   *
   * @param {Uint8Array|Uint8ClampedArray|ImageData|HTMLImageElement|HTMLCanvasElement} buffer - Input frame
   * @param {number} width - Source frame width
   * @param {number} height - Source frame height
   */
  LibretroShaderPipeline.prototype.render = function (buffer, width, height) {
    if (!this.gl) return;
    var gl = this.gl;

    // Auto-sync canvas internal resolution with its display size for crisp CRT scanlines & masks
    if (this.currentPresetId === "none") {
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    } else {
      var dpr = window.devicePixelRatio || 1;
      var cW = this.canvas.clientWidth || 0;
      var cH = this.canvas.clientHeight || 0;
      var targetW = (cW > 0) ? Math.min(1920, Math.round(cW * dpr)) : (width * 3);
      var targetH = (cH > 0) ? Math.min(1440, Math.round(cH * dpr)) : (height * 3);
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
    }

    // Upload source texture
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    if (buffer instanceof ImageData) {
      width = buffer.width;
      height = buffer.height;
      if (this.sourceWidth !== width || this.sourceHeight !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
        this.sourceWidth = width;
        this.sourceHeight = height;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      }
    } else if (buffer && (buffer.nodeName === "CANVAS" || buffer.nodeName === "IMG")) {
      width = buffer.width;
      height = buffer.height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      this.sourceWidth = width;
      this.sourceHeight = height;
    } else if (buffer && buffer.byteLength !== undefined) {
      var u8 = (buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray)
        ? buffer
        : new Uint8Array(buffer);
      if (this.sourceWidth !== width || this.sourceHeight !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, u8);
        this.sourceWidth = width;
        this.sourceHeight = height;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, u8);
      }
    }

    var currentInTexture = this.sourceTexture;
    var currentInW = width;
    var currentInH = height;

    // Standard 4x4 Identity Matrix
    var idMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];

    var numPasses = this.compiledPasses.length;
    for (var i = 0; i < numPasses; i++) {
      var pass = this.compiledPasses[i];
      var isLast = (i === numPasses - 1);

      var outW = this.canvas.width;
      var outH = this.canvas.height;
      if (!isLast) {
        if (pass.scale_type === "source") {
          outW = Math.max(1, Math.round(currentInW * pass.scale));
          outH = Math.max(1, Math.round(currentInH * pass.scale));
        } else if (pass.scale_type === "viewport") {
          outW = Math.max(1, Math.round(this.canvas.width * pass.scale));
          outH = Math.max(1, Math.round(this.canvas.height * pass.scale));
        }
      }

      var targetFbo = null;
      if (!isLast) {
        var fboObj = this._ensureFBO(i, outW, outH);
        targetFbo = fboObj.fbo;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
      gl.viewport(0, 0, outW, outH);

      gl.useProgram(pass.program);

      // Select quad buffer:
      // Pass 0 samples sourceTexture (UNPACK_FLIP_Y=false, V=0 is top)
      // Pass 1+ samples FBO texture (WebGL FBO texture coords, V=1 is top)
      var activeQuad = (i === 0) ? this.quadBufferSource : this.quadBufferFBO;
      gl.bindBuffer(gl.ARRAY_BUFFER, activeQuad);

      // Bind input texture & filtering (Texture Unit 0)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentInTexture);
      var filterMode = pass.filter_linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterMode);
      if (pass.uniforms.Texture !== null) gl.uniform1i(pass.uniforms.Texture, 0);

      // Bind original source texture (Texture Unit 1)
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      if (pass.uniforms.OrigTexture !== null) gl.uniform1i(pass.uniforms.OrigTexture, 1);

      // Vertex Attributes (Interleaved 24 bytes: x, y, u, v, origU, origV)
      if (pass.attribs.VertexCoord >= 0) {
        gl.enableVertexAttribArray(pass.attribs.VertexCoord);
        gl.vertexAttribPointer(pass.attribs.VertexCoord, 2, gl.FLOAT, false, 24, 0);
      }
      if (pass.attribs.TexCoord >= 0) {
        gl.enableVertexAttribArray(pass.attribs.TexCoord);
        gl.vertexAttribPointer(pass.attribs.TexCoord, 2, gl.FLOAT, false, 24, 8);
      }
      if (pass.attribs.OrigTexCoord >= 0) {
        gl.enableVertexAttribArray(pass.attribs.OrigTexCoord);
        gl.vertexAttribPointer(pass.attribs.OrigTexCoord, 2, gl.FLOAT, false, 24, 16);
      }

      // Standard Uniforms
      if (pass.uniforms.MVPMatrix !== null) gl.uniformMatrix4fv(pass.uniforms.MVPMatrix, false, idMatrix);
      if (pass.uniforms.OutputSize !== null) gl.uniform2f(pass.uniforms.OutputSize, outW, outH);
      if (pass.uniforms.TextureSize !== null) gl.uniform2f(pass.uniforms.TextureSize, currentInW, currentInH);
      if (pass.uniforms.InputSize !== null) gl.uniform2f(pass.uniforms.InputSize, width, height);
      if (pass.uniforms.OrigInputSize !== null) gl.uniform2f(pass.uniforms.OrigInputSize, width, height);
      if (pass.uniforms.FrameCount !== null) gl.uniform1i(pass.uniforms.FrameCount, this.frameCount);
      if (pass.uniforms.FrameDirection !== null) gl.uniform1i(pass.uniforms.FrameDirection, 1);

      // Pass Parameter Uniforms
      var paramNames = Object.keys(pass.paramUniforms);
      for (var p = 0; p < paramNames.length; p++) {
        var pName = paramNames[p];
        var loc = pass.paramUniforms[pName];
        if (loc !== null && this.activeParameters[pName] !== undefined) {
          gl.uniform1f(loc, this.activeParameters[pName]);
        }
      }

      // Render Quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isLast) {
        currentInTexture = this.fboPool[i].texture;
        currentInW = outW;
        currentInH = outH;
      }
    }

    this.frameCount++;
  };

  /**
   * Helper to populate and synchronize an HTML <select> element with
   * libretro presets, grouping by category and restoring user selection.
   *
   * @param {HTMLSelectElement|string} selectOrId - Target select element
   * @param {function} [onPresetChange] - Optional callback when preset changes
   */
  LibretroShaderPipeline.prototype.bindSelectElement = function (selectOrId, onPresetChange) {
    var sel = (typeof selectOrId === "string") ? document.getElementById(selectOrId) : selectOrId;
    if (!sel) return;

    sel.innerHTML = "";

    // Group presets by category
    var categories = {};
    var presetKeys = Object.keys(PRESET_DEFINITIONS);
    for (var i = 0; i < presetKeys.length; i++) {
      var key = presetKeys[i];
      var preset = PRESET_DEFINITIONS[key];
      var cat = preset.category || "General";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ id: key, name: preset.name });
    }

    var catNames = Object.keys(categories);
    for (var c = 0; c < catNames.length; c++) {
      var catName = catNames[c];
      var optgroup = document.createElement("optgroup");
      optgroup.label = catName;
      var list = categories[catName];
      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        var opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        if (item.id === this.currentPresetId) {
          opt.selected = true;
        }
        optgroup.appendChild(opt);
      }
      sel.appendChild(optgroup);
    }

    var self = this;
    sel.addEventListener("change", function () {
      self.setPreset(this.value);
      if (typeof onPresetChange === "function") {
        onPresetChange(this.value, PRESET_DEFINITIONS[this.value]);
      }
    });
  };

  global.LibretroShaderPipeline = LibretroShaderPipeline;

})(typeof window !== "undefined" ? window : globalThis);
