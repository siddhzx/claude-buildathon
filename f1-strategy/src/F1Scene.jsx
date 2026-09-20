/**
 * F1Scene.jsx — drop-in R3F scene: stylised car, airflow ribbons, tyre heat, damage.
 *
 *   npm i three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing
 *
 *   <F1Scene telemetry={telemetry} shot="front" />
 *
 * Drag to orbit / scroll to zoom — the `shot` prop still drives an eased camera
 * transition to a preset, but the user is free to rotate around it afterwards.
 *
 * telemetry = {
 *   tyreTemp:  [0.55, 0.55, 0.8, 0.8],   // FL FR RL RR, 0..1  (0 cold, .5 optimal, 1 white hot)
 *   tyreWear:  [0.1, 0.1, 0.4, 0.4],     // 0 new .. 1 dead
 *   flatSpot:  [0, 0, 0, 0],             // 0..1 per corner
 *   dirtyAir:  0,                        // 0 clean .. 1 fully in the wake
 *   braking:   0,                        // 0..1 -> brake disc glow + nose dive
 *   drs:       false,
 *   damage:    { frontWing: 0, floorL: 0, floorR: 0 },  // 0..1
 * }
 */

import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, extend } from '@react-three/fiber'
import {
  Environment,
  shaderMaterial,
  ContactShadows,
  OrbitControls,
  RoundedBox,
  MeshReflectorMaterial,
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

/* ------------------------------------------------------------------ config */

const TEAM = '#ff8000'          // accent — swap per team
const CARBON = '#0b0c10'

const SHOTS = {
  front: { pos: [4.6, 1.5, 4.2], target: [0, 0.5, 0] },
  over:  { pos: [0.5, 5.4, 2.4], target: [0, 0.2, 0] },
  wing:  { pos: [-4.4, 1.1, 2.0], target: [-2.2, 0.8, 0] },
}

const DEFAULT = {
  tyreTemp: [0.55, 0.55, 0.78, 0.78],
  tyreWear: [0.1, 0.1, 0.35, 0.35],
  flatSpot: [0, 0, 0, 0],
  dirtyAir: 0,
  braking: 0,
  drs: false,
  damage: { frontWing: 0, floorL: 0, floorR: 0 },
}

/* ------------------------------------------------------- tyre shader material */

const TyreMaterial = shaderMaterial(
  { uTemp: 0.5, uWear: 0, uFlat: 0, uTime: 0 },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTemp, uWear, uFlat, uTime;
    varying vec2 vUv;
    varying vec3 vNormal;

    // FLIR-style "ironbow" thermal-camera ramp
    vec3 ironbow(float t) {
      vec3 c0 = vec3(0.01, 0.01, 0.02);
      vec3 c1 = vec3(0.10, 0.02, 0.28);
      vec3 c2 = vec3(0.45, 0.02, 0.50);
      vec3 c3 = vec3(0.85, 0.12, 0.20);
      vec3 c4 = vec3(1.00, 0.50, 0.02);
      vec3 c5 = vec3(1.00, 0.92, 0.25);
      vec3 c6 = vec3(1.00, 1.00, 1.00);
      float x = clamp(t, 0.0, 1.0);
      vec3 col = mix(c0, c1, smoothstep(0.0, 0.16, x));
      col = mix(col, c2, smoothstep(0.16, 0.34, x));
      col = mix(col, c3, smoothstep(0.34, 0.52, x));
      col = mix(col, c4, smoothstep(0.52, 0.70, x));
      col = mix(col, c5, smoothstep(0.70, 0.86, x));
      col = mix(col, c6, smoothstep(0.86, 1.00, x));
      return col;
    }

    float noise2(vec2 p) {
      return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
    }

    void main() {
      // vUv.y runs across the tyre width -> shoulders run hotter under load
      float shoulder = pow(abs(vUv.y - 0.5) * 2.0, 1.6);
      float base = clamp(uTemp + shoulder * 0.16 * smoothstep(0.2, 1.0, uTemp), 0.0, 1.0);

      // simulated convection: hot spots drift/flicker instead of sitting static,
      // but only once the tread is actually hot enough to matter
      float hotGate = smoothstep(0.6, 0.75, base);
      float drift = sin(vUv.x * 10.0 + uTime * 1.3) * cos(vUv.y * 6.0 - uTime * 0.7);
      float grain = noise2(vUv * 30.0 + floor(uTime * 6.0)) - 0.5;
      float t = clamp(base + (drift * 0.05 + grain * 0.05) * hotGate, 0.0, 1.0);

      // solid black rubber tread; heat only tints it above ~70%
      vec3 rubber = vec3(0.028, 0.026, 0.026);
      float heatAmount = smoothstep(0.70, 1.0, t);
      vec3 heatColor = ironbow(smoothstep(0.70, 1.0, t));
      vec3 col = mix(rubber, heatColor, heatAmount);

      // tread grooves fade out as the tyre wears
      float grooves = step(0.5, fract(vUv.y * 6.0));
      col *= mix(1.0, mix(0.55, 1.0, uWear), 0.6) * mix(0.72, 1.0, grooves);

      // flat spot: dark scar that rotates with the wheel
      float scar = smoothstep(0.06, 0.0, abs(fract(vUv.x) - 0.25)) * uFlat;
      col = mix(col, vec3(0.015), scar);

      // faint rim light so the silhouette reads on black, without lifting the base colour
      float rim = pow(1.0 - abs(vNormal.z), 4.0);
      col += rim * 0.035;

      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `
)

/* ---------------------------------------------------- airflow ribbon material */

const FlowMaterial = shaderMaterial(
  { uTime: 0, uTurb: 0, uFade: 1, uSeed: 0.5 },
  /* glsl */ `
    uniform float uTime, uTurb, uSeed;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 p = position;
      // turbulence grows toward the nose when sitting in dirty air;
      // uSeed staggers frequency/phase per streamline so they don't move in lockstep
      float front = smoothstep(0.6, 0.0, uv.x);
      float freq = 8.0 + uSeed * 6.0;
      float n = sin(p.z * freq + uTime * (4.0 + uSeed * 3.0) + uSeed * 6.28)
              * cos(p.y * freq * 1.2 - uTime * (3.0 + uSeed * 2.0) + uSeed * 3.14);
      p += normal * n * (0.08 + uSeed * 0.05) * uTurb * front;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime, uTurb, uFade, uSeed;
    varying vec2 vUv;

    // CFD-style velocity-magnitude rainbow (slow=blue/purple, fast=red)
    vec3 turbo(float t) {
      vec3 c0 = vec3(0.19, 0.07, 0.32);
      vec3 c1 = vec3(0.13, 0.42, 0.88);
      vec3 c2 = vec3(0.10, 0.75, 0.70);
      vec3 c3 = vec3(0.47, 0.86, 0.20);
      vec3 c4 = vec3(0.97, 0.85, 0.10);
      vec3 c5 = vec3(0.98, 0.45, 0.10);
      vec3 c6 = vec3(0.88, 0.10, 0.10);
      float x = clamp(t, 0.0, 1.0);
      vec3 col = mix(c0, c1, smoothstep(0.0, 0.18, x));
      col = mix(col, c2, smoothstep(0.18, 0.34, x));
      col = mix(col, c3, smoothstep(0.34, 0.52, x));
      col = mix(col, c4, smoothstep(0.52, 0.68, x));
      col = mix(col, c5, smoothstep(0.68, 0.84, x));
      col = mix(col, c6, smoothstep(0.84, 1.00, x));
      return col;
    }

    void main() {
      // travelling pulses along the streamline, speed staggered per line
      float flow  = fract(vUv.x * 5.0 - uTime * (0.7 + uSeed * 0.5));
      float pulse = smoothstep(0.0, 0.12, flow) * smoothstep(0.62, 0.22, flow);

      // colour reads as local speed: per-line seed + live turbulence + gentle travel wobble
      float speed = clamp(
        uSeed * 0.65 + 0.15 + uTurb * 0.55
          + sin(vUv.x * 4.0 + uTime * 0.6 + uSeed * 9.0) * 0.06,
        0.0, 1.0
      );
      vec3 col = turbo(speed);

      float a = pulse * uFade * (0.18 + uTurb * 0.32);
      a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
      if (a < 0.003) discard;
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }
  `
)

extend({ TyreMaterial, FlowMaterial })

/* -------------------------------------------------------------------- pieces */

function CarbonMat({ color = CARBON, rough = 0.34, metal = 0.9, ...p }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} {...p} />
}

function Body() {
  return (
    <group>
      {/* floor — nearly touching the ground, long and low */}
      <mesh position={[0, 0.022, 0]} castShadow>
        <boxGeometry args={[6.0, 0.03, 1.5]} />
        <CarbonMat rough={0.4} />
      </mesh>

      {/* survival cell */}
      <RoundedBox args={[2.6, 0.38, 0.72]} radius={0.06} smoothness={4} position={[0.4, 0.3, 0]} castShadow>
        <CarbonMat />
      </RoundedBox>

      {/* nose */}
      <RoundedBox args={[1.8, 0.2, 0.28]} radius={0.07} smoothness={4} position={[2.2, 0.32, 0]} castShadow>
        <CarbonMat />
      </RoundedBox>

      {/* engine cover, tapering to the rear */}
      <RoundedBox args={[2.5, 0.5, 0.56]} radius={0.09} smoothness={4} position={[-1.15, 0.4, 0]} castShadow>
        <CarbonMat />
      </RoundedBox>
      <RoundedBox args={[0.9, 0.26, 0.22]} radius={0.06} smoothness={4} position={[-2.55, 0.32, 0]} castShadow>
        <CarbonMat />
      </RoundedBox>

      {/* airbox — kept low, mostly carbon */}
      <RoundedBox args={[0.4, 0.2, 0.3]} radius={0.04} smoothness={3} position={[-0.15, 0.56, 0]} castShadow>
        <CarbonMat rough={0.28} />
      </RoundedBox>

      {/* sidepods with a recessed dark intake on the leading face */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox args={[2.1, 0.36, 0.46]} radius={0.08} smoothness={4} position={[-0.15, 0.28, s * 0.6]} castShadow>
            <CarbonMat />
          </RoundedBox>
          <mesh position={[0.83, 0.28, s * 0.6]}>
            <boxGeometry args={[0.09, 0.24, 0.3]} />
            <meshStandardMaterial color="#040405" roughness={0.95} metalness={0.05} />
          </mesh>
        </group>
      ))}

      {/* rear diffuser: ramped floor + strakes */}
      <group position={[-2.65, 0.03, 0]}>
        <mesh rotation={[0.2, 0, 0]} position={[-0.3, -0.01, 0]} castShadow>
          <boxGeometry args={[0.8, 0.018, 1.4]} />
          <CarbonMat rough={0.45} />
        </mesh>
        {[-0.5, -0.17, 0.17, 0.5].map((z, i) => (
          <mesh key={i} position={[-0.3, 0.05, z]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.8, 0.12, 0.025]} />
            <CarbonMat rough={0.4} metal={0.55} />
          </mesh>
        ))}
      </group>

      {/* halo */}
      <mesh position={[1.0, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.36, 0.03, 8, 28, Math.PI]} />
        <CarbonMat rough={0.25} />
      </mesh>

      {/* thin team accent stripe — the only large-ish colour hit on the body */}
      <mesh position={[0.4, 0.47, 0]}>
        <boxGeometry args={[2.62, 0.014, 0.24]} />
        <meshStandardMaterial color={TEAM} emissive={TEAM} emissiveIntensity={0.2} roughness={0.4} />
      </mesh>
    </group>
  )
}

const FRONT_WING_ELEMENTS = [
  { x: 0, y: 0, z: 1.7, len: 0.6 },
  { x: -0.06, y: 0.075, z: 1.5, len: 0.46 },
  { x: -0.11, y: 0.15, z: 1.3, len: 0.34 },
]

function FrontWing({ damage = 0 }) {
  const flap = useRef()
  useFrame(({ clock }) => {
    if (!flap.current) return
    const t = clock.elapsedTime
    flap.current.rotation.x = damage * (0.5 + Math.sin(t * 14) * 0.22)
    flap.current.position.y = -damage * 0.04
  })
  return (
    <group position={[2.95, 0.1, 0]}>
      {/* multi-element flap stack, mostly carbon */}
      {FRONT_WING_ELEMENTS.map((el, i) => (
        <mesh key={i} position={[el.x, el.y, 0]} rotation={[-0.1 - i * 0.06, 0, 0]}>
          <boxGeometry args={[el.len, 0.022, el.z]} />
          <CarbonMat rough={0.3} metal={0.5} />
        </mesh>
      ))}
      {/* thin team accent on the mainplane's leading edge */}
      <mesh position={[0.27, -0.002, 0]}>
        <boxGeometry args={[0.035, 0.01, 1.62]} />
        <meshStandardMaterial color={TEAM} emissive={TEAM} emissiveIntensity={0.22} roughness={0.4} />
      </mesh>
      {/* damaged endplate hangs off the left, spans the full flap stack */}
      <group ref={flap} position={[-0.05, 0.08, 0.85]}>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.58, 0.32, 0.035]} />
          <CarbonMat rough={0.4} />
        </mesh>
      </group>
      <mesh position={[-0.05, 0.17, -0.85]}>
        <boxGeometry args={[0.58, 0.32, 0.035]} />
        <CarbonMat rough={0.4} />
      </mesh>
    </group>
  )
}

function RearWing({ drs = false }) {
  const flap = useRef()
  useFrame((_, dt) => {
    if (flap.current) {
      const target = drs ? -1.15 : 0
      flap.current.rotation.z = THREE.MathUtils.damp(flap.current.rotation.z, target, 6, dt)
    }
  })
  return (
    <group position={[-2.9, 0.56, 0]}>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.44, 0.045, 1.32]} />
        <CarbonMat rough={0.3} metal={0.5} />
      </mesh>
      {/* thin team accent along the trailing edge */}
      <mesh position={[-0.22, 0.1, 0]}>
        <boxGeometry args={[0.02, 0.03, 1.2]} />
        <meshStandardMaterial color={TEAM} emissive={TEAM} emissiveIntensity={0.2} roughness={0.4} />
      </mesh>
      <mesh ref={flap} position={[-0.2, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.045, 1.28]} />
        <CarbonMat rough={0.3} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.05, 0.14, s * 0.67]}>
          <boxGeometry args={[0.66, 0.6, 0.04]} />
          <CarbonMat rough={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/* --------------------------------------------------------------------- wheel */

function Wheel({ position, width = 0.32, radius = 0.34, temp, wear, flat, braking, steer = false, seed = 0 }) {
  const outer = useRef()
  const mat = useRef()
  const hub = useRef()
  const spin = useRef()
  const haze = useRef()

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime

    // roll about the wheel's own axle axis (local Y, after the static 90° orientation below)
    if (spin.current) spin.current.rotateY(-dt * 26)

    // subtle steering correction on the fronts — a small "critical" moving part
    if (outer.current && steer) {
      outer.current.rotation.y =
        Math.sin(t * 0.55 + seed) * 0.045 + Math.sin(t * 1.7 + seed * 3) * 0.015
    }

    if (mat.current) {
      mat.current.uTime = t
      // simulated thermal drift: real tyre/brake temps never sit perfectly flat
      const drift = (Math.sin(t * 0.9 + seed * 4.1) + Math.sin(t * 2.3 + seed * 1.7)) * 0.01
      mat.current.uTemp = THREE.MathUtils.damp(
        mat.current.uTemp, THREE.MathUtils.clamp(temp + drift, 0, 1), 3, dt
      )
      mat.current.uWear = wear
      mat.current.uFlat = flat
    }
    if (hub.current) {
      const glow = Math.max(braking * 3.2, temp * 0.5)
      hub.current.material.emissiveIntensity = THREE.MathUtils.damp(
        hub.current.material.emissiveIntensity, glow, 8, dt
      )
    }
    if (haze.current) {
      haze.current.material.opacity = Math.max(0, (temp - 0.72) * 1.6)
      haze.current.position.y = 0.52 + Math.sin(t * 3 + seed) * 0.02
      haze.current.rotation.z = Math.sin(t * 1.7 + seed) * 0.05
    }
  })

  return (
    <group ref={outer} position={position}>
      {/* static 90° orientation puts the axle along the car's lateral (Z) axis —
          rolling then happens about this group's own local Y via rotateY above */}
      <group ref={spin} rotation={[Math.PI / 2, 0, 0]}>
        {/* tread */}
        <mesh castShadow>
          <cylinderGeometry args={[radius, radius, width, 48, 1, true]} />
          {/* @ts-ignore */}
          <tyreMaterial ref={mat} side={THREE.DoubleSide} />
        </mesh>

        {/* sidewalls close the tube so it doesn't read as a hollow ring */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, s * (width / 2 - 0.004), 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 0.62, radius, 40]} />
            <meshStandardMaterial color="#0a0a0c" roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        ))}

        {/* rim */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 0.6, 0.03, 8, 28]} />
          <meshStandardMaterial color="#cfd2d8" metalness={0.95} roughness={0.18} />
        </mesh>

        {/* spokes */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * radius * 0.32, 0, Math.sin(a) * radius * 0.32]}
              rotation={[0, Math.PI / 2 - a, 0]}
            >
              <boxGeometry args={[0.045, 0.045, radius * 0.62]} />
              <meshStandardMaterial color="#cfd2d8" metalness={0.9} roughness={0.25} />
            </mesh>
          )
        })}

        {/* hub cap */}
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, width * 0.9, 16]} />
          <meshStandardMaterial color={TEAM} metalness={0.6} roughness={0.3} emissive={TEAM} emissiveIntensity={0.12} />
        </mesh>

        {/* brake disc — rotates with the hub, like the real thing */}
        <mesh ref={hub} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.04, 8, 24]} />
          <meshStandardMaterial color="#1a1412" emissive="#ff3a00" emissiveIntensity={0} roughness={0.6} />
        </mesh>
      </group>

      {/* heat haze */}
      <mesh ref={haze} position={[0, 0.52, 0]}>
        <planeGeometry args={[0.7, 0.4]} />
        <meshBasicMaterial color="#ffb08a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------- airflow */

function mulberry32(seed) {
  let a = seed
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a)
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296
  }
}

function buildStreamlines() {
  const rand = mulberry32(1337)
  const lines = []
  const lanes = 7 // fewer lanes — the car stays the subject, not the airflow

  for (let i = 0; i < lanes; i++) {
    const f = i / (lanes - 1)
    const z = THREE.MathUtils.lerp(-1.08, 1.08, f)
    const edge = Math.abs(z)
    for (const lift of [0, 1]) {
      const base = lift ? 0.95 : 0.22           // over the body / under the floor
      const freq = 6 + rand() * 6                // per-lane wiggle frequency — sporadic, not uniform
      const phase = rand() * Math.PI * 2
      const jitter = 0.03 + rand() * 0.06
      const speedSeed = 0.55 + rand() * 0.85      // colour-codes this lane's "velocity"
      const pts = []
      for (let s = 0; s <= 26; s++) {
        const u = s / 26
        const x = THREE.MathUtils.lerp(3.6, -4.6, u)
        const hump = Math.exp(-Math.pow((x - 0.2) / 1.5, 2)) * (lift ? 0.34 : -0.04)
        const wash = Math.sin(u * Math.PI) * (edge > 0.6 ? 0.22 : 0.06) * Math.sign(z || 1)
        const taper = Math.sin(u * Math.PI)
        const wobble = Math.sin(u * freq + phase) * jitter * taper
        const y = base + hump + wobble * 0.6 - u * 0.05
        pts.push(new THREE.Vector3(x, Math.max(0.06, y), z + wash + wobble))
      }
      lines.push({
        curve: new THREE.CatmullRomCurve3(pts),
        side: Math.sign(z) || 1,
        seed: speedSeed,
        tube: lift ? 0.008 : 0.007,
      })
    }
  }

  // front-wing vortices
  for (const s of [-1, 1]) {
    const freq = 20 + rand() * 6
    const pts = []
    for (let i = 0; i <= 34; i++) {
      const u = i / 34
      const x = THREE.MathUtils.lerp(2.7, -3.6, u)
      const r = 0.09 + u * 0.2
      pts.push(new THREE.Vector3(
        x,
        0.28 + Math.sin(u * freq) * r,
        s * (0.88 + u * 0.1) + Math.cos(u * freq) * r
      ))
    }
    lines.push({ curve: new THREE.CatmullRomCurve3(pts), side: s, vortex: true, seed: 0.85 + rand() * 0.15, tube: 0.011 })
  }

  // rear diffuser wake vortices — chaotic recirculation behind the car
  for (const s of [-1, 1]) {
    const f1 = 10 + rand() * 5
    const f2 = 16 + rand() * 8
    const pts = []
    for (let i = 0; i <= 30; i++) {
      const u = i / 30
      const x = THREE.MathUtils.lerp(-2.4, -5.6, u)
      const r = 0.05 + u * 0.34
      const swirl = Math.sin(u * f1 + s) * r + Math.sin(u * f2 * 1.7) * r * 0.4
      pts.push(new THREE.Vector3(x, 0.22 + Math.abs(swirl) * 0.5, s * (0.72 + u * 0.25) + swirl))
    }
    lines.push({ curve: new THREE.CatmullRomCurve3(pts), side: s, wake: true, seed: rand(), tube: 0.013 })
  }

  return lines
}

function Airflow({ dirtyAir = 0, damage }) {
  const lines = useMemo(() => buildStreamlines(), [])
  const mats = useRef([])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    mats.current.forEach((m, i) => {
      if (!m) return
      const l = lines[i]
      m.uTime = t
      m.uSeed = l.seed
      const killed = l.side < 0 ? damage.floorL : damage.floorR
      // constant low-level flicker so lanes never look perfectly static, even at dirtyAir=0
      const flicker = 0.5 + 0.5 * Math.sin(t * (0.5 + l.seed * 1.6) + l.seed * 11.3)
      const baseline = l.wake ? 0.28 : l.vortex ? 0.12 : 0.04
      const target = Math.min(1, dirtyAir + killed * 0.8 + baseline + flicker * 0.14)
      m.uTurb = THREE.MathUtils.damp(m.uTurb, target, 3, dt)
      m.uFade = THREE.MathUtils.damp(m.uFade, 1 - killed * 0.75, 4, dt)
    })
  })

  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i}>
          <tubeGeometry args={[l.curve, 90, l.tube, 4, false]} />
          {/* @ts-ignore */}
          <flowMaterial
            ref={(r) => (mats.current[i] = r)}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------------------- camera */

function CameraRig({ shot = 'front', controlsRef }) {
  const initial = SHOTS[shot] ?? SHOTS.front
  const goalPos = useRef(new THREE.Vector3(...initial.pos))
  const goalTarget = useRef(new THREE.Vector3(...initial.target))
  const animating = useRef(true)

  useEffect(() => {
    const s = SHOTS[shot] ?? SHOTS.front
    goalPos.current.set(...s.pos)
    goalTarget.current.set(...s.target)
    animating.current = true
  }, [shot])

  useFrame(({ camera }, dt) => {
    if (!animating.current) return
    const k = 1 - Math.pow(0.001, dt)
    camera.position.lerp(goalPos.current, k)
    if (controlsRef.current) controlsRef.current.target.lerp(goalTarget.current, k)
    const posDone = camera.position.distanceTo(goalPos.current) < 0.01
    const targetDone = !controlsRef.current || controlsRef.current.target.distanceTo(goalTarget.current) < 0.01
    if (posDone && targetDone) animating.current = false
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={2.4}
      maxDistance={13}
      maxPolarAngle={Math.PI / 2 - 0.03}
      onStart={() => { animating.current = false }}
    />
  )
}

/* --------------------------------------------------------------------- scene */

function Scene({ telemetry, shot }) {
  const t = { ...DEFAULT, ...telemetry, damage: { ...DEFAULT.damage, ...(telemetry?.damage ?? {}) } }
  const rig = useRef()
  const controlsRef = useRef()

  const corners = [
    { pos: [1.9, 0.34, 0.8], w: 0.3, r: 0.34, front: true },     // FL
    { pos: [1.9, 0.34, -0.8], w: 0.3, r: 0.34, front: true },    // FR
    { pos: [-2.0, 0.37, 0.74], w: 0.38, r: 0.37, front: false }, // RL
    { pos: [-2.0, 0.37, -0.74], w: 0.38, r: 0.37, front: false },// RR
  ]

  // brake dive: nose drops and chassis pitches under load — a small "critical" motion
  useFrame((_, dt) => {
    if (!rig.current) return
    rig.current.rotation.z = THREE.MathUtils.damp(rig.current.rotation.z, t.braking * 0.03, 5, dt)
    rig.current.position.y = THREE.MathUtils.damp(rig.current.position.y, -0.2 - t.braking * 0.015, 5, dt)
  })

  return (
    <>
      <Environment preset="night" environmentIntensity={0.35} />
      {/* cool 3-point rig: white key, dim cool ambient, blue rim from behind — no orange fill */}
      <ambientLight intensity={0.06} color="#8fa4ff" />
      <directionalLight position={[4, 7, 5]} intensity={2.6} color="#ffffff" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 3.5, -6]} intensity={1.1} color="#4d6fff" />
      <spotLight position={[0, 6, -3]} angle={0.6} penumbra={1} intensity={0.5} color="#dfe6ff" />

      <group ref={rig} position={[0, -0.2, 0]}>
        <Body />
        <FrontWing damage={t.damage.frontWing} />
        <RearWing drs={t.drs} />
        {corners.map((c, i) => (
          <Wheel
            key={i}
            position={c.pos}
            width={c.w}
            radius={c.r}
            temp={t.tyreTemp[i]}
            wear={t.tyreWear[i]}
            flat={t.flatSpot[i]}
            braking={t.braking}
            steer={c.front}
            seed={i}
          />
        ))}
        <Airflow dirtyAir={t.dirtyAir} damage={t.damage} />
        <ContactShadows position={[0, 0.005, 0]} opacity={0.7} scale={12} blur={2.2} far={3} />
      </group>

      {/* dark reflective studio floor, not a glowing slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={512}
          mixBlur={1}
          mixStrength={35}
          roughness={0.94}
          depthScale={1}
          minDepthThreshold={0.85}
          maxDepthThreshold={1.2}
          color="#030304"
          metalness={0.5}
          mirror={0}
        />
      </mesh>

      <CameraRig shot={shot} controlsRef={controlsRef} />

      <EffectComposer disableNormalPass>
        <Bloom intensity={0.5} luminanceThreshold={0.88} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.9} />
      </EffectComposer>
    </>
  )
}

export default function F1Scene({ telemetry, shot = 'front', className }) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 38, position: SHOTS.front.pos, near: 0.1, far: 100 }}
      style={{ background: '#050608' }}
    >
      <Scene telemetry={telemetry} shot={shot} />
    </Canvas>
  )
}
