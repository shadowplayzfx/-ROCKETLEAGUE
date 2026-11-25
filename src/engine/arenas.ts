import * as THREE from 'three';
import { ARENA_BOUNDS, BOOST_PADS, FFA_ARENA_BOUNDS, FFA_BOOST_PADS } from '../shared/constants.ts';
import type { ArenaId, BoostPadState, GraphicsQuality, PartyGameMode } from '../shared/types.ts';
import {
  createGoalNetTexture,
  createHexMeshTexture,
  createPitchTexture,
  createSkylineTexture,
} from './textures.ts';

export interface BoostPadVisual {
  id: number;
  isLarge: boolean;
  orbMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
}

export interface ArenaHandle {
  group: THREE.Group;
  boostPadVisuals: BoostPadVisual[];
  animatedObjects: THREE.Object3D[];
  update: (time: number, dt: number, padStates: BoostPadState[]) => void;
  dispose: () => void;
}

/**
 * Concave quarter-pipe ramp running along Z from -length/2 to +length/2.
 * Cross-section curves smoothly from floor (x = -radius, y = 0.01) up to wall (x = 0, y = radius).
 */
function createQuarterPipeGeometry(length: number, radius: number, segs = 10): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfL = length * 0.5;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const angle = t * Math.PI * 0.5; // 0 = floor tangent, PI/2 = vertical wall tangent
    const x = -radius + Math.sin(angle) * radius;
    const y = radius - Math.cos(angle) * radius + 0.01;
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);

    positions.push(x, y, -halfL);
    positions.push(x, y, halfL);
    normals.push(nx, ny, 0, nx, ny, 0);
    uvs.push(t, 0, t, 1);
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function buildArena(
  scene: THREE.Scene,
  arenaId: ArenaId,
  quality: GraphicsQuality,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  gameMode: PartyGameMode = 'team_2v1'
): ArenaHandle {
  const group = new THREE.Group();
  const isFfa = gameMode === 'ffa';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const animatedObjects: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    texs.push(t);
    return t;
  };

  const hw = ARENA_BOUNDS.HALF_WIDTH;
  const hl = ARENA_BOUNDS.HALF_LENGTH;
  const h = ARENA_BOUNDS.HEIGHT;
  const gw = ARENA_BOUNDS.GOAL_HALF_WIDTH;
  const gh = ARENA_BOUNDS.GOAL_HEIGHT;
  const gd = ARENA_BOUNDS.GOAL_DEPTH;
  const corner = ARENA_BOUNDS.CORNER_SIZE;

  // 1. Calibrated Lighting & Sky Atmosphere (rich saturation, no white blowout)
  const shadowSize = isSoftwareGl
    ? 512
    : quality === 'ultra'
      ? 2048
      : quality === 'high'
        ? 1536
        : quality === 'medium'
          ? 1024
          : 512;

  if (arenaId === 'sunset_arena') {
    scene.background = new THREE.Color(0x161224);
    scene.fog = new THREE.FogExp2(0x28192c, 0.0021);

    const skyGeo = trackGeo(new THREE.SphereGeometry(340, 24, 16));
    const skyMat = trackMat(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x0b1533) },
          midColor: { value: new THREE.Color(0x6b2c4b) },
          horizonColor: { value: new THREE.Color(0xd97736) },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 horizonColor;
          varying vec3 vWorldPos;
          void main() {
            float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
            vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
            col = mix(col, topColor, smoothstep(0.28, 0.85, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    group.add(new THREE.Mesh(skyGeo, skyMat));

    const hemi = new THREE.HemisphereLight(0xfed7aa, 0x1e293b, 0.75);
    group.add(hemi);

    const sun = new THREE.DirectionalLight(0xffcf99, 1.35);
    sun.position.set(62, 60, -72);
    sun.castShadow = !isSoftwareGl && quality !== 'low';
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 230;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    group.add(sun);

    const rim = new THREE.DirectionalLight(0x60a5fa, 0.55);
    rim.position.set(-55, 35, 65);
    group.add(rim);
  } else if (arenaId === 'cyber_arena') {
    scene.background = new THREE.Color(0x060714);
    scene.fog = new THREE.FogExp2(0x070818, 0.0024);

    const hemi = new THREE.HemisphereLight(0xa855f7, 0x0b1022, 0.78);
    group.add(hemi);

    const key = new THREE.DirectionalLight(0xe2e8f0, 1.25);
    key.position.set(38, 78, 32);
    key.castShadow = !isSoftwareGl && quality !== 'low';
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 75;
    key.shadow.camera.bottom = -75;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 190;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    group.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.6);
    rim.position.set(-45, 42, -45);
    group.add(rim);
  } else {
    // Rocket League Midnight Floodlit Stadium
    scene.background = new THREE.Color(0x050914);
    scene.fog = new THREE.FogExp2(0x060b19, 0.002);

    const skyGeo = trackGeo(new THREE.SphereGeometry(340, 24, 16));
    const skyMat = trackMat(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x030712) },
          horizonColor: { value: new THREE.Color(0x0f1f3d) },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          varying vec3 vWorldPos;
          void main() {
            float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
            vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.65, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    group.add(new THREE.Mesh(skyGeo, skyMat));

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x14261c, 0.78);
    group.add(hemi);

    const key = new THREE.DirectionalLight(0xf1f5f9, 1.32);
    key.position.set(42, 82, 36);
    key.castShadow = !isSoftwareGl && quality !== 'low';
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 75;
    key.shadow.camera.bottom = -75;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 200;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    group.add(key);

    const fill = new THREE.DirectionalLight(0x38bdf8, 0.55);
    fill.position.set(-45, 36, -50);
    group.add(fill);
  }

  // Textures
  const pitchTex = trackTex(createPitchTexture(arenaId, maxAnisotropy));
  const hexWallTex = trackTex(
    createHexMeshTexture(
      arenaId === 'cyber_arena' ? 'rgba(168, 85, 247, 0.52)' : 'rgba(56, 189, 248, 0.48)',
      maxAnisotropy
    )
  );
  hexWallTex.repeat.set(8, 3.5);

  const hexDomeTex = trackTex(createHexMeshTexture('rgba(56, 189, 248, 0.62)', maxAnisotropy));
  hexDomeTex.repeat.set(16, 10);

  const blueNetTex = trackTex(createGoalNetTexture('rgba(56, 189, 248, 0.85)', maxAnisotropy));
  blueNetTex.repeat.set(6, 3);
  const orangeNetTex = trackTex(createGoalNetTexture('rgba(251, 146, 60, 0.85)', maxAnisotropy));
  orangeNetTex.repeat.set(6, 3);
  const emeraldNetTex = trackTex(createGoalNetTexture('rgba(52, 211, 153, 0.85)', maxAnisotropy));
  emeraldNetTex.repeat.set(6, 3);

  const skylineTex = trackTex(createSkylineTexture());
  skylineTex.repeat.set(1, 2);

  // Materials
  const wallMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: arenaId === 'cyber_arena' ? 0x6d28d9 : 0x0ea5e9,
      map: hexWallTex,
      transparent: true,
      opacity: 0.24,
      roughness: 0.14,
      metalness: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  const domeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      map: hexDomeTex,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x162032,
      metalness: 0.72,
      roughness: 0.34,
    })
  );

  const rampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x142234,
      metalness: 0.35,
      roughness: 0.58,
    })
  );

  const bluePanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  const orangePanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: 0xea580c,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );

  const blueRailMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.1,
      roughness: 0.22,
    })
  );

  const orangeRailMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfb923c,
      emissive: 0xea580c,
      emissiveIntensity: 1.1,
      roughness: 0.22,
    })
  );

  const goalFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111c2b,
      roughness: 0.65,
      metalness: 0.15,
    })
  );

  const apronGeo = trackGeo(new THREE.RingGeometry(64, 260, 48));
  apronGeo.rotateX(-Math.PI * 0.5);
  const apronMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0a131f,
      roughness: 0.9,
      metalness: 0.12,
    })
  );
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = -0.15;
  group.add(apron);

  const standMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.72,
      metalness: 0.25,
    })
  );

  // Helper to add a 4-sided open-front goal net
  const addGoalNetPanels = (
    parent: THREE.Object3D,
    netColor: number,
    netTex: THREE.CanvasTexture,
    posZ: number,
    dirSign: number
  ) => {
    const netMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: netColor,
        map: netTex,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const centerZ = posZ + dirSign * (gd * 0.5);
    const backZ = posZ + dirSign * gd;

    // Back net
    const backNet = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, gh)), netMat);
    backNet.position.set(0, gh * 0.5, backZ);
    parent.add(backNet);

    // Top net
    const topNet = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, gd)), netMat);
    topNet.rotation.x = Math.PI * 0.5;
    topNet.position.set(0, gh, centerZ);
    parent.add(topNet);

    // Left & right nets
    for (const side of [-1, 1]) {
      const sideNet = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gd, gh)), netMat);
      sideNet.rotation.y = Math.PI * 0.5;
      sideNet.position.set(side * gw, gh * 0.5, centerZ);
      parent.add(sideNet);
    }
  };

  if (isFfa) {
    // 3-Goal Hexagonal Triad Arena (1v1v1 FFA)
    const A = FFA_ARENA_BOUNDS.APOTHEM;
    const circumR = (A * 2) / Math.sqrt(3);
    const sideLen = circumR;
    const sideHalfLen = sideLen * 0.5;

    const hexPitchGeo = trackGeo(new THREE.CircleGeometry(circumR, 6));
    hexPitchGeo.rotateX(-Math.PI * 0.5);
    hexPitchGeo.rotateY(Math.PI / 6);
    const hexPitchMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: pitchTex,
        roughness: 0.76,
        metalness: 0.04,
      })
    );
    const hexPitch = new THREE.Mesh(hexPitchGeo, hexPitchMat);
    hexPitch.receiveShadow = true;
    group.add(hexPitch);

    const centerRingGeo = trackGeo(new THREE.RingGeometry(8.5, 9.0, 48));
    centerRingGeo.rotateX(-Math.PI * 0.5);
    const centerLineMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.72 })
    );
    const centerRing = new THREE.Mesh(centerRingGeo, centerLineMat);
    centerRing.position.y = 0.02;
    group.add(centerRing);

    const goalConfigs = [
      { angle: FFA_ARENA_BOUNDS.GOAL_ANGLES.blue, color: 0x0ea5e9, netTex: blueNetTex },
      { angle: FFA_ARENA_BOUNDS.GOAL_ANGLES.orange, color: 0xf97316, netTex: orangeNetTex },
      { angle: FFA_ARENA_BOUNDS.GOAL_ANGLES.emerald, color: 0x10b981, netTex: emeraldNetTex },
    ];

    const rampGeoSide = trackGeo(createQuarterPipeGeometry(sideLen - 2, 3.2, 8));

    for (let i = 0; i < 6; i++) {
      const theta = (i * Math.PI) / 3;
      const sideGroup = new THREE.Group();
      sideGroup.rotation.y = theta;
      group.add(sideGroup);

      const goalCfg = goalConfigs.find((g) => Math.abs(g.angle - theta) < 0.05);
      if (!goalCfg) {
        const wall = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(sideLen, h)), wallMat);
        wall.position.set(0, h * 0.5, A);
        sideGroup.add(wall);

        const ramp = new THREE.Mesh(rampGeoSide, rampMat);
        ramp.rotation.y = -Math.PI * 0.5;
        ramp.position.set(0, 0, A);
        sideGroup.add(ramp);

        const curb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sideLen, 1.3, 0.9)), frameMat);
        curb.position.set(0, 0.65, A + 0.45);
        sideGroup.add(curb);

        const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sideLen, 0.28, 0.2)), blueRailMat);
        strip.position.set(0, 1.4, A - 0.04);
        sideGroup.add(strip);

        const topBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sideLen, 0.8, 0.8)), frameMat);
        topBeam.position.set(0, h, A + 0.3);
        sideGroup.add(topBeam);
      } else {
        const goalGlowMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: goalCfg.color,
            emissive: goalCfg.color,
            emissiveIntensity: 1.2,
            roughness: 0.22,
          })
        );

        const panelW = sideHalfLen - gw;
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(panelW, h)), wallMat);
          panel.position.set(side * (gw + panelW * 0.5), h * 0.5, A);
          sideGroup.add(panel);

          const eStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(panelW, 0.28, 0.22)), goalGlowMat);
          eStrip.position.set(side * (gw + panelW * 0.5), 1.4, A);
          sideGroup.add(eStrip);
        }

        const upperWall = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, h - gh)), wallMat);
        upperWall.position.set(0, gh + (h - gh) * 0.5, A);
        sideGroup.add(upperWall);

        const postGeo = trackGeo(new THREE.BoxGeometry(0.7, gh, 0.7));
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeo, goalGlowMat);
          post.position.set(side * gw, gh * 0.5, A);
          sideGroup.add(post);
        }
        const crossbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(gw * 2 + 0.7, 0.7, 0.7)), goalGlowMat);
        crossbar.position.set(0, gh, A);
        sideGroup.add(crossbar);

        const goalLine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(gw * 2, 0.04, 0.35)), goalGlowMat);
        goalLine.position.set(0, 0.02, A);
        sideGroup.add(goalLine);

        const gf = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, gd)), goalFloorMat);
        gf.rotation.x = -Math.PI * 0.5;
        gf.position.set(0, 0.005, A + gd * 0.5);
        gf.receiveShadow = true;
        sideGroup.add(gf);

        addGoalNetPanels(sideGroup, goalCfg.color, goalCfg.netTex, A, 1);
      }

      const stand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(sideLen * 0.92, 7, 7)), standMat);
      stand.position.set(0, 4.5, A + 14);
      sideGroup.add(stand);
    }

    // Hexagonal Neon-Blue Mesh Dome Ceiling
    const domeGeo = trackGeo(
      new THREE.SphereGeometry(circumR * 1.18, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.33)
    );
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = h - circumR * 1.18 * Math.cos(Math.PI * 0.33);
    group.add(dome);
  } else {
    // 2. Standard Rocket League 2-Goal Rectangular Stadium
    const pitchGeo = trackGeo(new THREE.PlaneGeometry(hw * 2, hl * 2));
    pitchGeo.rotateX(-Math.PI * 0.5);
    const pitchMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: pitchTex,
        roughness: arenaId === 'cyber_arena' ? 0.45 : 0.78,
        metalness: arenaId === 'cyber_arena' ? 0.18 : 0.04,
      })
    );
    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.receiveShadow = true;
    group.add(pitchMesh);

    for (const sign of [-1, 1]) {
      const gf = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, gd)), goalFloorMat);
      gf.rotation.x = -Math.PI * 0.5;
      gf.position.set(0, 0.005, sign * (hl + gd * 0.5));
      gf.receiveShadow = true;
      group.add(gf);
    }

    // Side walls (along Z), split into Orange (-Z) half and Blue (+Z) half
    const sideLen = (hl - corner) * 2;
    const halfSideLen = sideLen * 0.5;
    const rampRadius = 3.6;
    const sideRampGeo = trackGeo(createQuarterPipeGeometry(sideLen, rampRadius, 10));

    for (const sign of [-1, 1]) {
      // Full-height hex-mesh glass wall
      const wall = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(sideLen, h)), wallMat);
      wall.position.set(sign * hw, h * 0.5, 0);
      wall.rotation.y = sign * -Math.PI * 0.5;
      group.add(wall);

      // Curved wall-to-floor ramp transition
      const sideRamp = new THREE.Mesh(sideRampGeo, rampMat);
      sideRamp.position.set(sign * hw, 0, 0);
      if (sign === -1) sideRamp.rotation.y = Math.PI;
      group.add(sideRamp);

      // Team-tinted lower wall panels & neon rails (-Z Orange half, +Z Blue half)
      for (const halfZ of [-1, 1]) {
        const isBlueHalf = halfZ === 1;
        const pMat = isBlueHalf ? bluePanelMat : orangePanelMat;
        const rMat = isBlueHalf ? blueRailMat : orangeRailMat;

        const lowPanel = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(halfSideLen, 5.2)), pMat);
        lowPanel.position.set(sign * (hw - 0.03), 2.6, halfZ * halfSideLen * 0.5);
        lowPanel.rotation.y = sign * -Math.PI * 0.5;
        group.add(lowPanel);

        const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.3, halfSideLen)), rMat);
        strip.position.set(sign * (hw - 0.05), 3.65, halfZ * halfSideLen * 0.5);
        group.add(strip);
      }

      const curb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 1.3, sideLen)), frameMat);
      curb.position.set(sign * (hw + 0.45), 0.65, 0);
      group.add(curb);

      const topBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 0.9, sideLen)), frameMat);
      topBeam.position.set(sign * (hw + 0.35), h, 0);
      group.add(topBeam);
    }

    // 45-degree corner chamfer walls + curved wall-to-floor corner ramps + team tint
    const cornerHyp = Math.sqrt(corner * corner * 2);
    const cornerRampGeo = trackGeo(createQuarterPipeGeometry(cornerHyp + 0.6, rampRadius, 10));
    const cornerDefs = [
      { x: -hw + corner * 0.5, z: -hl + corner * 0.5, ry: Math.PI * 0.25, isBlue: false, flipRamp: false },
      { x: hw - corner * 0.5, z: -hl + corner * 0.5, ry: -Math.PI * 0.25, isBlue: false, flipRamp: true },
      { x: -hw + corner * 0.5, z: hl - corner * 0.5, ry: -Math.PI * 0.25, isBlue: true, flipRamp: false },
      { x: hw - corner * 0.5, z: hl - corner * 0.5, ry: Math.PI * 0.25, isBlue: true, flipRamp: true },
    ];
    for (const c of cornerDefs) {
      const cw = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(cornerHyp, h)), wallMat);
      cw.position.set(c.x, h * 0.5, c.z);
      cw.rotation.y = c.ry;
      group.add(cw);

      const cLow = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(cornerHyp, 5.2)),
        c.isBlue ? bluePanelMat : orangePanelMat
      );
      cLow.position.set(c.x, 2.6, c.z);
      cLow.rotation.y = c.ry;
      group.add(cLow);

      const cStrip = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(cornerHyp, 0.3, 0.22)),
        c.isBlue ? blueRailMat : orangeRailMat
      );
      cStrip.position.set(c.x, 3.65, c.z);
      cStrip.rotation.y = c.ry;
      group.add(cStrip);

      const cRamp = new THREE.Mesh(cornerRampGeo, rampMat);
      cRamp.position.set(c.x, 0, c.z);
      cRamp.rotation.y = c.ry + (c.flipRamp ? Math.PI * 0.5 : -Math.PI * 0.5);
      group.add(cRamp);
    }

    // End walls & Glowing Goals (Orange at -Z, Blue at +Z)
    const endSideW = hw - corner - gw;
    const endRampGeo = trackGeo(createQuarterPipeGeometry(endSideW, rampRadius, 10));

    for (const sign of [-1, 1]) {
      const isBlue = sign === 1;
      const teamColor = isBlue ? 0x0ea5e9 : 0xf97316;
      const teamNetTex = isBlue ? blueNetTex : orangeNetTex;
      const teamPanelMat = isBlue ? bluePanelMat : orangePanelMat;

      const goalGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: teamColor,
          emissive: teamColor,
          emissiveIntensity: 1.25,
          roughness: 0.22,
        })
      );

      for (const side of [-1, 1]) {
        const px = side * (gw + endSideW * 0.5);
        const panel = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(endSideW, h)), wallMat);
        panel.position.set(px, h * 0.5, sign * hl);
        group.add(panel);

        const lowEndPanel = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(endSideW, 5.2)), teamPanelMat);
        lowEndPanel.position.set(px, 2.6, sign * (hl - 0.03));
        group.add(lowEndPanel);

        const eStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(endSideW, 0.3, 0.22)), goalGlowMat);
        eStrip.position.set(px, 3.65, sign * hl);
        group.add(eStrip);

        const endRamp = new THREE.Mesh(endRampGeo, rampMat);
        endRamp.position.set(px, 0, sign * hl);
        endRamp.rotation.y = sign === 1 ? -Math.PI * 0.5 : Math.PI * 0.5;
        group.add(endRamp);
      }

      const upperWall = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(gw * 2, h - gh)), wallMat);
      upperWall.position.set(0, gh + (h - gh) * 0.5, sign * hl);
      group.add(upperWall);

      const postGeo = trackGeo(new THREE.BoxGeometry(0.75, gh, 0.75));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, goalGlowMat);
        post.position.set(side * gw, gh * 0.5, sign * hl);
        group.add(post);
      }
      const crossbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(gw * 2 + 0.75, 0.75, 0.75)), goalGlowMat);
      crossbar.position.set(0, gh, sign * hl);
      group.add(crossbar);

      const goalLine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(gw * 2, 0.04, 0.38)), goalGlowMat);
      goalLine.position.set(0, 0.02, sign * hl);
      group.add(goalLine);

      addGoalNetPanels(group, teamColor, teamNetTex, sign * hl, sign);
    }

    // Neon-Blue Hex-Mesh Arched Stadium Dome / Ceiling over pitch
    const domeRadius = hw + 10;
    const domeGeo = trackGeo(
      new THREE.CylinderGeometry(
        domeRadius,
        domeRadius,
        hl * 2,
        28,
        1,
        true,
        -Math.PI * 0.36,
        Math.PI * 0.72
      )
    );
    domeGeo.rotateX(Math.PI * 0.5);
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.position.set(0, h - domeRadius * Math.cos(Math.PI * 0.36), 0);
    group.add(domeMesh);

    // Sweeping roof trusses framing the hex dome
    for (let z = -44; z <= 44; z += 22) {
      const archGeo = trackGeo(new THREE.TorusGeometry(domeRadius, 0.42, 8, 36, Math.PI * 0.72));
      const arch = new THREE.Mesh(archGeo, frameMat);
      arch.rotation.z = Math.PI * 0.14;
      arch.position.set(0, h - domeRadius * Math.cos(Math.PI * 0.36), z);
      group.add(arch);

      const neonArc = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(domeRadius - 0.5, 0.14, 6, 36, Math.PI * 0.72)),
        blueRailMat
      );
      neonArc.rotation.z = Math.PI * 0.14;
      neonArc.position.set(0, h - domeRadius * Math.cos(Math.PI * 0.36), z);
      group.add(neonArc);
    }

    // Tiered Grandstands
    const standTiers = [
      { distX: hw + 11, distZ: hl + 15, y: 4, h: 6 },
      { distX: hw + 19, distZ: hl + 23, y: 10, h: 7 },
    ];
    for (const tier of standTiers) {
      for (const side of [-1, 1]) {
        const standSide = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7, tier.h, hl * 1.9)), standMat);
        standSide.position.set(side * tier.distX, tier.y, 0);
        group.add(standSide);

        const standEnd = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(hw * 1.9, tier.h, 7)), standMat);
        standEnd.position.set(0, tier.y, side * tier.distZ);
        group.add(standEnd);
      }
    }

    // Instanced Crowd Silhouettes in the stands
    const crowdCount = quality === 'low' ? 160 : 420;
    const crowdGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.85, 0.65));
    const crowdMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
    const dummy = new THREE.Object3D();
    const cColor = new THREE.Color();

    for (let i = 0; i < crowdCount; i++) {
      const onSide = i % 2 === 0;
      const sign = i % 4 < 2 ? 1 : -1;
      const tierIdx = i % 2;
      const yBase = tierIdx === 0 ? 7.6 : 14.1;
      if (onSide) {
        dummy.position.set(sign * (hw + 10 + tierIdx * 8), yBase, (Math.random() - 0.5) * hl * 1.75);
      } else {
        dummy.position.set((Math.random() - 0.5) * hw * 1.75, yBase, sign * (hl + 14 + tierIdx * 8));
      }
      dummy.updateMatrix();
      crowdMesh.setMatrixAt(i, dummy.matrix);

      const hueChoice = Math.random();
      if (hueChoice < 0.42) cColor.setHex(0x38bdf8);
      else if (hueChoice < 0.84) cColor.setHex(0xf97316);
      else cColor.setHex(0xe2e8f0);
      crowdMesh.setColorAt(i, cColor);
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
    crowdMesh.computeBoundingSphere();
    group.add(crowdMesh);
  }

  // 3. Night City Skyline, Floodlight Towers, and Instanced Stylized Trees outside the Arena
  const buildingCount = quality === 'low' ? 48 : 88;
  const bldgGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const bldgMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: skylineTex,
      emissive: 0x1e293b,
      emissiveMap: skylineTex,
      emissiveIntensity: 0.75,
      roughness: 0.75,
      metalness: 0.25,
    })
  );
  const bldgMesh = new THREE.InstancedMesh(bldgGeo, bldgMat, buildingCount);
  const bDummy = new THREE.Object3D();
  for (let i = 0; i < buildingCount; i++) {
    const angle = (i / buildingCount) * Math.PI * 2 + (i % 3) * 0.03;
    const dist = 122 + (i % 5) * 18 + ((i * 7) % 15);
    const bw = 12 + ((i * 11) % 14);
    const bd = 12 + ((i * 13) % 14);
    const bh = 28 + ((i * 23) % 68);
    bDummy.position.set(Math.cos(angle) * dist, bh * 0.5 - 1, Math.sin(angle) * dist);
    bDummy.rotation.y = angle;
    bDummy.scale.set(bw, bh, bd);
    bDummy.updateMatrix();
    bldgMesh.setMatrixAt(i, bDummy.matrix);
  }
  bldgMesh.instanceMatrix.needsUpdate = true;
  bldgMesh.computeBoundingSphere();
  group.add(bldgMesh);

  // Instanced Stylized Trees ringing the stadium parkway
  const treeCount = quality === 'low' ? 32 : 64;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.65, 3.2, 6));
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b2820, roughness: 0.9 }));
  const foliageGeo = trackGeo(new THREE.ConeGeometry(2.8, 7.5, 7));
  const foliageMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x15472a, roughness: 0.85 }));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
  const tDummy = new THREE.Object3D();

  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * Math.PI * 2;
    const dist = 86 + (i % 4) * 7;
    const s = 0.85 + (i % 3) * 0.25;
    const tx = Math.cos(a) * dist;
    const tz = Math.sin(a) * dist;

    tDummy.position.set(tx, 1.5 * s, tz);
    tDummy.scale.setScalar(s);
    tDummy.updateMatrix();
    trunkInst.setMatrixAt(i, tDummy.matrix);

    tDummy.position.set(tx, 5.5 * s, tz);
    tDummy.scale.setScalar(s);
    tDummy.updateMatrix();
    foliageInst.setMatrixAt(i, tDummy.matrix);
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  foliageInst.instanceMatrix.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  foliageInst.computeBoundingSphere();
  group.add(trunkInst);
  group.add(foliageInst);

  // Stadium Floodlight Towers at the 4 corners
  const floodHeadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 1.25,
      roughness: 0.15,
    })
  );
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 46, 2.2)), frameMat);
      tower.position.set(sx * (hw + 25), 23, sz * (hl + 26));
      group.add(tower);

      const lightHead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.5, 3.0, 1.4)), floodHeadMat);
      lightHead.position.set(sx * (hw + 23), 46, sz * (hl + 24));
      lightHead.lookAt(0, 0, 0);
      group.add(lightHead);
    }
  }

  // Cyber Arena animated orbital rings
  if (arenaId === 'cyber_arena') {
    const ringMat1 = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true, transparent: true, opacity: 0.4 })
    );
    const ringMat2 = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.4 })
    );
    const ring1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(32, 0.7, 8, 48)), ringMat1);
    ring1.position.set(0, h + 16, 0);
    ring1.rotation.x = Math.PI * 0.5;
    group.add(ring1);
    animatedObjects.push(ring1);

    const ring2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(22, 0.5, 8, 40)), ringMat2);
    ring2.position.set(0, h + 20, 0);
    ring2.rotation.x = Math.PI * 0.38;
    group.add(ring2);
    animatedObjects.push(ring2);
  }

  // 4. Boost Pads (Large glowing orbs in corners/midfield + orange/yellow floor discs)
  const boostPadVisuals: BoostPadVisual[] = [];
  const padBaseMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.32 })
  );
  const boostRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
      roughness: 0.25,
    })
  );
  const boostOrbMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf97316,
      emissiveIntensity: 1.3,
      roughness: 0.15,
      metalness: 0.2,
    })
  );

  const largeBaseGeo = trackGeo(new THREE.CylinderGeometry(1.55, 1.8, 0.14, 20));
  const smallBaseGeo = trackGeo(new THREE.CylinderGeometry(1.1, 1.25, 0.1, 16));
  const largeRingGeo = trackGeo(new THREE.TorusGeometry(1.22, 0.12, 8, 24));
  largeRingGeo.rotateX(Math.PI * 0.5);
  const smallRingGeo = trackGeo(new THREE.TorusGeometry(0.88, 0.1, 8, 20));
  smallRingGeo.rotateX(Math.PI * 0.5);
  const largeOrbGeo = trackGeo(new THREE.SphereGeometry(0.68, 16, 12));
  const smallDiscGeo = trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 16));

  const padDefs = isFfa ? FFA_BOOST_PADS : BOOST_PADS;
  for (const pad of padDefs) {
    const base = new THREE.Mesh(pad.isLarge ? largeBaseGeo : smallBaseGeo, padBaseMat);
    base.position.set(pad.x, 0.06, pad.z);
    group.add(base);

    const ring = new THREE.Mesh(pad.isLarge ? largeRingGeo : smallRingGeo, boostRingMat);
    ring.position.set(pad.x, 0.14, pad.z);
    group.add(ring);

    const orb = new THREE.Mesh(pad.isLarge ? largeOrbGeo : smallDiscGeo, boostOrbMat);
    orb.position.set(pad.x, pad.isLarge ? 1.18 : 0.16, pad.z);
    group.add(orb);

    boostPadVisuals.push({
      id: pad.id,
      isLarge: pad.isLarge,
      orbMesh: orb,
      ringMesh: ring,
    });
  }

  scene.add(group);

  return {
    group,
    boostPadVisuals,
    animatedObjects,
    update(time: number, _dt: number, padStates: BoostPadState[]) {
      if (animatedObjects.length >= 2) {
        animatedObjects[0].rotation.z = time * 0.18;
        animatedObjects[1].rotation.z = -time * 0.28;
        animatedObjects[1].rotation.y = time * 0.15;
      }

      for (let i = 0; i < boostPadVisuals.length; i++) {
        const vis = boostPadVisuals[i];
        const st = padStates[i];
        const active = st ? st.active : true;
        vis.orbMesh.visible = active;
        vis.ringMesh.visible = active;
        if (active) {
          vis.orbMesh.rotation.y = time * 2.2 + vis.id;
          if (vis.isLarge) {
            vis.orbMesh.position.y = 1.18 + Math.sin(time * 3.2 + vis.id) * 0.14;
          }
        }
      }
    },
    dispose() {
      scene.remove(group);
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
