// City facade material (from 桜川市, the previous city project): one cel-shaded (MeshToon) material for ALL building massing.
// Windows, mullions, spandrels, balcony doors, louvers, roof tiles and the painted ground-floor shop band
// are drawn procedurally in the fragment shader from per-vertex facade attributes, so a 200 m tower is
// a handful of triangles. Glass shows a per-window-jittered sky reflection (anime "checkerboard" blues),
// sun glints and, at dusk, lit windows. Distant fog is height-attenuated so towers rise out of the haze.
//
// Vertex attributes (see massing.js):
//   uv      facade coords in metres: x along the face (left->right seen from outside), y = height above
//           the building base.  For style SIGN, uv = atlas coords in uSigns.
//   color   wall albedo (linear)
//   aFac    (style, floorH, bayW, seed 0..1)
//   aFac2   (groundStoreyH, faceWidth, flags, variant 0..1)   flags: 1 = shop band on the ground storey,
//                                                               2 = lit lobby, 4 = no windows below g1
//   aGlass  glass tint (linear)
import * as THREE from 'three';

export const STYLE = { blank: 0, punched: 1, ribbon: 2, curtain: 3, grid: 4, balcony: 5, shop: 6, small: 7, roof: 8, louver: 9, slit: 10, railing: 11, sign: 12, plain: 13, roofGreen: 14, glassRail: 15 };

const FACADE_GLSL = /* glsl */`
float fz_h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fz_n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(fz_h(i), fz_h(i+vec2(1,0)), f.x), mix(fz_h(i+vec2(0,1)), fz_h(i+vec2(1,1)), f.x), f.y); }
// anti-aliased box mask of f inside [lo,hi]; w = filter half width (in f units)
float fz_box(vec2 f, vec2 lo, vec2 hi, vec2 w){
  vec2 a = smoothstep(lo - w, lo + w, f) * (1.0 - smoothstep(hi - w, hi + w, f));
  return a.x * a.y;
}
float fz_line(float f, float c, float hw, float w){ return 1.0 - smoothstep(hw - w, hw + w, abs(f - c)); }
`;

/** Create (once per ctx) the facade material. */
export function facadeMaterial(ctx, signsTex) {
  if (ctx.__cityFacade) return ctx.__cityFacade;
  const m = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.035, name: 'city-facade' });
  // the toon cache would hand the same material to anyone asking for these args: clone to own it
  const mat = m.clone();
  mat.userData = { cityFacade: true };
  const base = m.onBeforeCompile;
  const U = {
    uSkyZen: { value: new THREE.Color('#5f97d8') },
    uSkyHor: { value: new THREE.Color('#dce8f2') },
    uSkyLow: { value: new THREE.Color('#7d8796') },
    uSunW: ctx.shared.uSunDir,
    uTime: ctx.shared.uTime,
    uNight: { value: 0 },
    uSigns: { value: signsTex || null },
    uHasSigns: { value: signsTex ? 1 : 0 },
    uFogMul: { value: 0.62 }, uHazeHigh: { value: 0.3 }, uHazeY0: { value: 10.0 }, uHazeY1: { value: 150.0 }, uHazeMax: { value: 0.9 },
    uLitMul: { value: 1.0 },
  };
  mat.userData.uniforms = U;
  mat.onBeforeCompile = (shader, renderer) => {
    if (base) base.call(m, shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFac; attribute vec4 aFac2; attribute vec3 aGlass;
        varying vec2 vFUV; flat varying vec4 vFac; flat varying vec4 vFac2; flat varying vec3 vGlass; varying vec3 vWN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFUV = uv; vFac = aFac; vFac2 = aFac2; vGlass = aGlass;
        { vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wn = mat3(instanceMatrix) * wn;
          #endif
          vWN = normalize(mat3(modelMatrix) * wn); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSkyZen, uSkyHor, uSkyLow, uSunW; uniform float uTime, uNight, uHasSigns, uLitMul;
        uniform float uFogMul, uHazeHigh, uHazeY0, uHazeY1, uHazeMax; uniform sampler2D uSigns;
        varying vec2 vFUV; flat varying vec4 vFac; flat varying vec4 vFac2; flat varying vec3 vGlass; varying vec3 vWN;
        ${FACADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fWin = 0.0; vec3 fGlass = vec3(0.0); vec3 fEmit = vec3(0.0); float fRefl = 1.0;
        {
          float style = floor(vFac.x + 0.5);
          float fh = max(vFac.y, 1.0), bw = max(vFac.z, 0.5), seed = floor(vFac.w * 997.0 + 0.5) / 997.0;
          float g1 = vFac2.x, faceW = vFac2.y, flags = floor(vFac2.z + 0.5), variant = vFac2.w;
          vec2 uvm = vFUV;
          vec3 wall = diffuseColor.rgb;
          vec3 V = normalize(cameraPosition - vPWorld);
          vec3 N0 = normalize(vWN);
          if (style > 11.5 && style < 12.5) {
            // sign face: atlas colour (already sRGB-decoded by the texture colorSpace)
            if (uHasSigns > 0.5) { vec4 sc = texture2D(uSigns, uvm); diffuseColor.rgb = sc.rgb; fEmit = sc.rgb * 0.18; }
          } else if (style > 7.5 && style < 8.5) {
            // flat roof: membrane / tiles with joints and rain stains
            vec2 t = vPWorld.xz / 1.2; vec2 ft = fract(t); vec2 aw = fwidth(t) * 0.8 + 0.001;
            float j = max(fz_line(ft.x, 0.0, 0.03, aw.x) + fz_line(ft.x, 1.0, 0.03, aw.x), fz_line(ft.y, 0.0, 0.03, aw.y) + fz_line(ft.y, 1.0, 0.03, aw.y));
            float fade = 1.0 - smoothstep(0.25, 0.6, max(aw.x, aw.y));
            diffuseColor.rgb *= 1.0 - 0.1 * j * fade;
            float st = fz_n(vPWorld.xz * 0.18 + seed * 31.0);
            diffuseColor.rgb *= 0.93 + 0.1 * st;
          } else if (style > 13.5 && style < 14.5) {
            // roof garden: grass with shrub blobs
            float n = fz_n(vPWorld.xz * 0.6) * 0.6 + fz_n(vPWorld.xz * 2.1) * 0.4;
            diffuseColor.rgb = mix(vec3(0.19, 0.33, 0.12), vec3(0.3, 0.46, 0.18), n);
          } else if (style > 12.5 && style < 13.5) {
            // plain: nothing
          } else if (style > 10.5 && style < 11.5 || style > 14.5) {
            // balcony railing panel: frosted / metal panel with balusters and a top rail
            vec2 f = vec2(uvm.x / 0.12, uvm.y);
            vec2 aw = fwidth(f) + 0.0005;
            float fade = 1.0 - smoothstep(0.2, 0.55, aw.x);
            float bar = fz_line(fract(f.x), 0.5, 0.18, aw.x) * fade;
            float rail = smoothstep(0.93, 0.97, fract(uvm.y / 1.1 + 0.001));
            if (style > 14.5) {
              // frosted glass railing: pale bluish panel
              vec3 fr = mix(vec3(0.55, 0.62, 0.7), vec3(0.72, 0.77, 0.82), 0.5 + 0.5 * fz_n(uvm * 0.7 + seed * 9.0));
              diffuseColor.rgb = mix(fr, wall * 0.75, rail);
            } else {
              diffuseColor.rgb = mix(wall, wall * 0.62, bar * 0.6);
              diffuseColor.rgb = mix(diffuseColor.rgb, wall * 0.55, rail);
            }
          } else {
            // ---------------------------------------------------------------- windowed walls
            bool shopFace = mod(flags, 2.0) > 0.5;
            bool shopBand = shopFace && uvm.y < g1;
            float v = uvm.y - g1;                 // height above the ground storey
            vec2 cell = vec2(uvm.x / bw, v / fh);
            // faces without a shop band get a window row in the ground storey too (scaled to its height)
            if (!shopFace && v < 0.0) { cell.y = uvm.y / max(g1, 1.0) - 1.0; v = 0.0; }
            vec2 id = floor(cell); vec2 f = fract(cell);
            vec2 aw = fwidth(cell) * 0.9 + 0.0008;
            float fade = smoothstep(0.08, 0.35, max(aw.x, aw.y));   // far away: average the pattern
            float rnd = fz_h(id + seed * 97.13), rnd2 = fz_h(id.yx * 1.7 + seed * 13.1 + 3.3);
            float win = 0.0, frame = 0.0, spandrel = 0.0, cover = 0.4;
            vec2 lo = vec2(0.18, 0.28), hi = vec2(0.82, 0.86);
            float edge = step(0.5, faceW) * (1.0 - step(bw * 0.45, uvm.x) * step(uvm.x, faceW - bw * 0.45)); // corner columns
            if (style < 0.5) {
              // blank party wall: panel joints only
              vec2 pj = vec2(uvm.x / 1.8, uvm.y / fh); vec2 pf = fract(pj); vec2 pw = fwidth(pj) + 0.0008;
              float j = max(fz_line(pf.x, 0.0, 0.015, pw.x) + fz_line(pf.x, 1.0, 0.015, pw.x), fz_line(pf.y, 0.0, 0.02, pw.y) + fz_line(pf.y, 1.0, 0.02, pw.y));
              diffuseColor.rgb *= 1.0 - 0.07 * j * (1.0 - smoothstep(0.2, 0.5, max(pw.x, pw.y)));
              cover = 0.0;
            } else if (style < 1.5) {                           // punched
              lo = vec2(0.16 + variant * 0.08, 0.3); hi = vec2(0.84 - variant * 0.08, 0.86);
              win = fz_box(f, lo, hi, aw); frame = fz_box(f, lo - 0.035, hi + vec2(0.035, 0.02), aw) - win; cover = (hi.x - lo.x) * (hi.y - lo.y);
              spandrel = fz_box(f, vec2(lo.x - 0.05, lo.y - 0.07), vec2(hi.x + 0.05, lo.y - 0.035), aw); // sill
            } else if (style < 2.5) {                           // ribbon
              lo = vec2(-0.1, 0.34 - variant * 0.08); hi = vec2(1.1, 0.9);
              win = fz_box(f, lo, hi, aw); cover = hi.y - lo.y;
              float mull = fz_line(f.x, 0.0, 0.025, aw.x) + fz_line(f.x, 1.0, 0.025, aw.x) + fz_line(f.x, 0.5, 0.012, aw.x) * step(0.5, variant);
              frame = clamp(mull, 0.0, 1.0) * win; win *= 1.0 - frame;
              spandrel = fz_box(f, vec2(-0.1, lo.y - 0.05), vec2(1.1, lo.y), aw);
            } else if (style < 3.5) {                           // curtain wall
              float mull = fz_line(f.x, 0.0, 0.018, aw.x) + fz_line(f.x, 1.0, 0.018, aw.x);
              float trans = fz_line(f.y, 0.0, 0.03, aw.y) + fz_line(f.y, 1.0, 0.03, aw.y);
              spandrel = fz_box(f, vec2(-0.1, 0.0), vec2(1.1, 0.2 + variant * 0.1), aw);
              win = 1.0 - clamp(mull + trans, 0.0, 1.0);
              frame = 1.0 - win; cover = 0.9;
            } else if (style < 4.5) {                           // exposed frame grid (deep reveals)
              lo = vec2(0.13, 0.2); hi = vec2(0.87, 0.97);
              win = fz_box(f, lo, hi, aw); cover = 0.6;
              // soffit shadow in the reveal (anime depth cue) + lit sill
              float sof = fz_box(f, vec2(lo.x, hi.y - 0.12), hi, aw);
              float jamb = fz_box(f, lo, vec2(lo.x + 0.05, hi.y), aw);
              frame = max(sof, jamb) * 0.9;
              win *= 1.0 - max(sof, jamb);
              spandrel = fz_box(f, vec2(lo.x, lo.y - 0.02), vec2(hi.x, lo.y + 0.02), aw);
            } else if (style < 5.5) {                           // behind balconies: sliding doors
              lo = vec2(0.1, 0.03); hi = vec2(0.9, 0.8);
              win = fz_box(f, lo, hi, aw); frame = fz_box(f, lo - 0.03, hi + 0.03, aw) - win; cover = 0.55;
              float mid = fz_line(f.x, 0.5, 0.015, aw.x) * win; frame += mid; win -= mid;
            } else if (style < 7.5) {                           // small back windows, sparse
              lo = vec2(0.36, 0.5); hi = vec2(0.64, 0.82);
              float keep = step(0.45, rnd);
              win = fz_box(f, lo, hi, aw) * keep; frame = (fz_box(f, lo - 0.04, hi + 0.04, aw) - fz_box(f, lo, hi, aw)) * keep; cover = 0.05;
            } else if (style > 8.5 && style < 9.5) {            // louvers / fins (parking, crowns)
              float fin = fract(uvm.x / 0.45);
              float fl = smoothstep(0.35, 0.5, fin) * (1.0 - smoothstep(0.85, 1.0, fin));
              float aww = fwidth(uvm.x / 0.45);
              fl = mix(fl, 0.45, smoothstep(0.2, 0.5, aww));
              diffuseColor.rgb *= 0.78 + 0.26 * fl;
              win = fz_box(f, vec2(-0.1, 0.25), vec2(1.1, 0.9), aw) * 0.45 * (1.0 - fl); cover = 0.25;
            } else if (style > 9.5 && style < 10.5) {           // slit windows
              lo = vec2(0.42, 0.14); hi = vec2(0.58, 0.9);
              win = fz_box(f, lo, hi, aw); frame = fz_box(f, lo - 0.03, hi + 0.03, aw) - win; cover = 0.12;
            }
            // no windows on the ground storey band (shop geometry / band drawn below) nor in corner columns
            float above = step(0.0, v);
            win *= above * (1.0 - edge * step(style, 2.5) * step(1.5, style) * 0.0);
            frame *= above; spandrel *= above;
            // distance: collapse the pattern to its average coverage
            win = mix(win, cover * above, fade); frame = mix(frame, 0.0, fade); spandrel = mix(spandrel, 0.0, fade);
            // colours
            vec3 frameCol = style > 2.5 && style < 3.5 ? mix(wall, vec3(0.62, 0.66, 0.7), 0.6) : wall * 0.55;
            diffuseColor.rgb = mix(diffuseColor.rgb, frameCol, clamp(frame, 0.0, 1.0) * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, style > 2.5 && style < 3.5 ? vGlass * 0.55 : wall * 1.08 + 0.02, spandrel * 0.8);
            // ---- glass
            vec3 N = normalize(N0 + (vec3(rnd, 0.0, rnd2) - 0.5) * vec3(0.09, 0.0, 0.09) * (1.0 - fade));
            vec3 Rf = reflect(-V, N);
            float ry = Rf.y + (rnd - 0.5) * 0.05 * (1.0 - fade);
            vec3 sky = mix(uSkyHor, uSkyZen, smoothstep(0.02, 0.6, ry));
            // soft reflected clouds
            vec2 cq = clamp(Rf.xz / max(Rf.y + 0.25, 0.2), -4.0, 4.0);
            float cl = smoothstep(0.55, 0.8, fz_n(cq * 1.6 + vec2(uTime * 0.004, 0.0)) * 0.7 + fz_n(cq * 4.0) * 0.3);
            sky = mix(sky, vec3(0.92, 0.94, 0.97), cl * 0.45 * smoothstep(0.0, 0.2, ry));
            sky = mix(uSkyLow * (0.8 + 0.4 * rnd2), sky, smoothstep(-0.18, 0.02, ry));
            float fres = pow(1.0 - clamp(dot(N0, V), 0.0, 1.0), 2.0);
            float reflK = mix(0.45, 0.95, fres);
            // interiors: blinds / curtains / lit ceilings vary per window
            vec3 inside = vGlass * mix(0.35, 0.6, rnd2);
            float blind = step(0.72, rnd) * (style < 4.5 || style > 9.5 ? 1.0 : 0.0);
            float curtain = step(0.5, rnd2) * (style > 4.5 && style < 5.5 ? 1.0 : 0.0);
            float lf = fract(cell.y);
            float slat = lf * 16.0, slatW = fwidth(slat);
            float slats = mix(smoothstep(0.35, 0.65, abs(fract(slat) - 0.5) * 2.0), 0.5, smoothstep(0.25, 0.7, slatW));
            inside = mix(inside, vec3(0.74, 0.76, 0.77), blind * (0.7 + 0.2 * slats) * smoothstep(0.3, 0.55, lf));
            inside = mix(inside, vec3(0.84, 0.8, 0.72), curtain * smoothstep(0.58, 0.64, fract(cell.x)) * 0.85);
            vec3 g = mix(inside, sky, reflK * (1.0 - blind * 0.5));
            // diagonal highlight streak (anime glass)
            float sd = dot(vPWorld, normalize(vec3(0.62, 0.78, 0.62))) * 0.25 + rnd * 0.3;
            float band = abs(fract(sd) - 0.5);
            g += vec3(1.0) * smoothstep(0.03, 0.0, abs(band - 0.2)) * 0.18 * (1.0 - fade) * step(2.5, style) * step(style, 3.5);
            // sun glint
            float gl = pow(max(dot(Rf, normalize(uSunW)), 0.0), 420.0);
            g += vec3(1.0, 0.9, 0.75) * gl * 3.0;
            // dusk / night: lit windows
            float litP = step(rnd2, 0.55 + 0.25 * rnd) * uNight;
            vec3 litC = mix(vec3(1.0, 0.82, 0.55), vec3(0.85, 0.92, 1.0), step(0.6, fz_h(id * 3.1 + seed)));
            fEmit += litC * litP * 1.25 * uLitMul * win;
            fWin = clamp(win, 0.0, 1.0);
            fGlass = g;
            diffuseColor.rgb = mix(diffuseColor.rgb, g * 0.22, fWin);
            // ---- ground storey shop band (painted stand-in; detail geometry covers it near the player)
            if (shopBand) {
              float gy = uvm.y / g1;
              float bays = max(1.0, floor(faceW / 5.5 + 0.5));
              float bx = uvm.x / faceW * bays; float bi = floor(bx); float bf = fract(bx);
              float h3 = fz_h(vec2(bi, seed * 7.0));
              vec2 bw2 = vec2(fwidth(bx), fwidth(gy)) + 0.001;
              float glassS = fz_box(vec2(bf, gy), vec2(0.06, 0.02), vec2(0.94, 0.7), bw2);
              float signS = fz_box(vec2(bf, gy), vec2(-0.1, 0.74), vec2(1.1, 0.96), bw2);
              vec3 hue = 0.5 + 0.5 * cos(6.2831 * (h3 + vec3(0.0, 0.33, 0.67)));
              vec3 signC = mix(vec3(0.9, 0.88, 0.84), hue * 0.8, step(0.35, h3));
              diffuseColor.rgb = mix(diffuseColor.rgb, signC, signS);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.17, 0.19), glassS);
              fEmit += mix(vec3(0.95, 0.82, 0.62), vec3(0.8, 0.86, 0.9), step(0.5, h3)) * glassS * (0.16 + 0.16 * h3);
              fWin = max(fWin, 0.0);
            }
          }
        }`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = mix(outgoingLight, outgoingLight * 0.45 + fGlass, fWin) + fEmit;
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          float fzHi = uFogMul * mix(1.0, uHazeHigh, smoothstep(uHazeY0, uHazeY1, vPWorld.y));
          #ifdef FOG_EXP2
            float fzD = fogDensity * fzHi * vFogDepth;
            float fzF = (1.0 - exp(-fzD * fzD)) * uHazeMax;
          #else
            float fzF = smoothstep(fogNear, fogFar, vFogDepth) * uHazeMax;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fzF);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'paint|cityFacade';
  ctx.__cityFacade = mat;
  return mat;
}

/** Give any three.js material the city's height-attenuated haze (same uniforms as the facade material), so
 *  far-visible things (signs, billboards, landmarks) fade exactly like the buildings they sit on.
 *  Returns a clone (the original may be cached/shared by ctx.mat). */
export function withCityHaze(ctx, material) {
  const F = facadeMaterial(ctx, null);
  const U = F.userData.uniforms;
  const m = material.clone();
  const base = material.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (base) base.call(material, shader, renderer);
    shader.uniforms.uFogMul = U.uFogMul; shader.uniforms.uHazeHigh = U.uHazeHigh; shader.uniforms.uHazeY0 = U.uHazeY0;
    shader.uniforms.uHazeY1 = U.uHazeY1; shader.uniforms.uHazeMax = U.uHazeMax;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHzW;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        { vec4 hw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            hw = instanceMatrix * hw;
          #endif
          vHzW = (modelMatrix * hw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHzW; uniform float uFogMul, uHazeHigh, uHazeY0, uHazeY1, uHazeMax;')
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          float hzHi = uFogMul * mix(1.0, uHazeHigh, smoothstep(uHazeY0, uHazeY1, vHzW.y));
          #ifdef FOG_EXP2
            float hzD = fogDensity * hzHi * vFogDepth;
            float hzF = (1.0 - exp(-hzD * hzD)) * uHazeMax;
          #else
            float hzF = smoothstep(fogNear, fogFar, vFogDepth) * uHazeMax;
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hzF);
        #endif`);
  };
  const key = (material.customProgramCacheKey ? material.customProgramCacheKey() : '') + '|cityHaze';
  m.customProgramCacheKey = () => key;
  return m;
}
