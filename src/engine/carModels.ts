import * as THREE from 'three';
import { BOOST_TRAIL_CATALOG, CAR_MAP } from '../shared/constants.ts';
import type { BoostTrailId, CarCustomization, CarId } from '../shared/types.ts';

export interface CarMeshHandle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheelSteerPivots: THREE.Group[]; // [FL, FR]
  wheelSpinGroups: THREE.Group[]; // [FL, FR, RL, RR]
  flameMeshes: THREE.Mesh[];
  boostLight: THREE.PointLight | null;
  updateAppearance: (customization: CarCustomization) => void;
  updateDynamicState: (opts: {
    steerAngle: number;
    wheelSpin: number;
    isBoosting: boolean;
    throttle: number;
    time: number;
  }) => void;
  setFirstPersonMode: (enabled: boolean) => void;
  dispose: () => void;
}

function createBodyProfileShape(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  return shape;
}

function getCarProfilePoints(carId: CarId, halfL: number, h: number): [number, number][] {
  // x goes from -halfL (rear, +Z after rotY(PI/2)) to +halfL (front, -Z after rotY(PI/2))
  switch (carId) {
    case 'striker': // Dominus-style long flat wedge sports coupe
      return [
        [-halfL, -h * 0.25],
        [-halfL * 0.96, h * 0.35],
        [-halfL * 0.55, h * 0.42],
        [-halfL * 0.32, h * 0.85],
        [halfL * 0.08, h * 0.84],
        [halfL * 0.42, h * 0.38],
        [halfL * 0.98, h * 0.16],
        [halfL, -h * 0.24],
      ];
    case 'nomad': // Octane-style tall rugged buggy
      return [
        [-halfL * 0.95, -h * 0.22],
        [-halfL * 0.92, h * 0.42],
        [-halfL * 0.48, h * 0.98],
        [halfL * 0.14, h * 0.96],
        [halfL * 0.52, h * 0.44],
        [halfL * 0.95, h * 0.24],
        [halfL * 0.98, -h * 0.22],
      ];
    case 'hyperion': // Futuristic ultra-low teardrop hypercar
      return [
        [-halfL, -h * 0.24],
        [-halfL * 0.94, h * 0.32],
        [-halfL * 0.42, h * 0.62],
        [-halfL * 0.05, h * 0.82],
        [halfL * 0.35, h * 0.68],
        [halfL * 0.78, h * 0.24],
        [halfL, -h * 0.12],
        [halfL * 0.94, -h * 0.26],
      ];
    case 'bullitt': // Classic boxy muscle car
      return [
        [-halfL, -h * 0.24],
        [-halfL * 0.98, h * 0.44],
        [-halfL * 0.52, h * 0.48],
        [-halfL * 0.35, h * 0.94],
        [halfL * 0.15, h * 0.92],
        [halfL * 0.38, h * 0.48],
        [halfL * 0.98, h * 0.36],
        [halfL, -h * 0.24],
      ];
    case 'rallyx': // Compact aggressive rally hatch
      return [
        [-halfL * 0.94, -h * 0.24],
        [-halfL * 0.88, h * 0.92],
        [-halfL * 0.28, h * 0.98],
        [halfL * 0.18, h * 0.92],
        [halfL * 0.48, h * 0.44],
        [halfL * 0.95, h * 0.24],
        [halfL * 0.96, -h * 0.24],
      ];
    case 'apex_s': // Mid-engine European supercar
      return [
        [-halfL, -h * 0.25],
        [-halfL * 0.96, h * 0.42],
        [-halfL * 0.52, h * 0.54],
        [-halfL * 0.18, h * 0.86],
        [halfL * 0.24, h * 0.78],
        [halfL * 0.62, h * 0.32],
        [halfL, h * 0.08],
        [halfL * 0.96, -h * 0.25],
      ];
    case 'formula': // Open-wheel formula nose & engine cover
      return [
        [-halfL, -h * 0.22],
        [-halfL * 0.9, h * 0.55],
        [-halfL * 0.25, h * 0.72],
        [halfL * 0.1, h * 0.45],
        [halfL * 0.75, h * 0.22],
        [halfL, 0.0],
        [halfL * 0.95, -h * 0.24],
      ];
    case 'juggernaut': // Heavy armored tactical vehicle
      return [
        [-halfL, -h * 0.2],
        [-halfL, h * 0.75],
        [-halfL * 0.45, h * 0.78],
        [-halfL * 0.3, h * 1.12],
        [halfL * 0.35, h * 1.1],
        [halfL * 0.55, h * 0.58],
        [halfL, h * 0.42],
        [halfL, -h * 0.2],
      ];
    case 'volt': // Sleek futuristic EV fastback
      return [
        [-halfL, -h * 0.24],
        [-halfL * 0.92, h * 0.52],
        [-halfL * 0.32, h * 0.92],
        [halfL * 0.2, h * 0.88],
        [halfL * 0.65, h * 0.42],
        [halfL * 0.98, h * 0.18],
        [halfL, -h * 0.24],
      ];
    case 'drift': // Compact street tuner fastback
    default:
      return [
        [-halfL, -h * 0.24],
        [-halfL * 0.95, h * 0.44],
        [-halfL * 0.45, h * 0.88],
        [halfL * 0.06, h * 0.88],
        [halfL * 0.42, h * 0.4],
        [halfL * 0.98, h * 0.18],
        [halfL, -h * 0.24],
      ];
  }
}

export function createCarModel(
  customization: CarCustomization,
  options?: { enablePointLights?: boolean }
): CarMeshHandle {
  const def = CAR_MAP[customization.carId] ?? CAR_MAP.striker;
  const { width, height, length, wheelRadius, wheelWidth } = def.dimensions;
  const halfL = length * 0.5;
  const halfW = width * 0.5;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometriesToDispose.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materialsToDispose.push(m);
    return m;
  };

  // Materials
  const primaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(customization.primaryColor),
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  const secondaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(customization.secondaryColor),
      metalness: 0.6,
      roughness: 0.28,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
    })
  );

  const darkChassisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.45,
      roughness: 0.62,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.14,
    })
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x09111e,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      opacity: 0.88,
      transparent: true,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.15,
    })
  );

  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xef4444,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16181d,
      metalness: 0.08,
      roughness: 0.86,
    })
  );

  // 1. Primary sculpted body silhouette
  const bodyWidth = customization.carId === 'formula' ? width * 0.46 : width * 0.84;
  const profilePoints = getCarProfilePoints(customization.carId, halfL, height);
  const bodyShape = createBodyProfileShape(profilePoints);
  const bodyGeo = trackGeo(
    new THREE.ExtrudeGeometry(bodyShape, {
      depth: bodyWidth,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
      steps: 1,
    })
  );
  bodyGeo.translate(0, 0, -bodyWidth * 0.5);
  bodyGeo.rotateY(Math.PI * 0.5); // Nose faces -Z

  const bodyMesh = new THREE.Mesh(bodyGeo, primaryMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.y = 0.06;
  bodyGroup.add(bodyMesh);

  // 2. Carbon under-tray / front splitter / side skirts
  const undertrayGeo = trackGeo(new THREE.BoxGeometry(width * 0.86, 0.1, length * 0.94));
  const undertray = new THREE.Mesh(undertrayGeo, darkChassisMat);
  undertray.position.set(0, -0.18, 0);
  undertray.castShadow = true;
  bodyGroup.add(undertray);

  const splitterGeo = trackGeo(new THREE.BoxGeometry(width * 0.94, 0.07, 0.45));
  const splitter = new THREE.Mesh(splitterGeo, secondaryMat);
  splitter.position.set(0, -0.17, -halfL + 0.1);
  bodyGroup.add(splitter);

  // 3. Racing stripe / secondary roof & hood trim
  const stripeW = customization.carId === 'formula' ? bodyWidth * 0.65 : width * 0.24;
  const stripeGeo = trackGeo(new THREE.BoxGeometry(stripeW, 0.04, length * 0.68));
  const stripeMesh = new THREE.Mesh(stripeGeo, secondaryMat);
  stripeMesh.position.set(0, height * 0.48, 0.15);
  bodyGroup.add(stripeMesh);

  // Front-only hood stripe visible cleanly from first-person cockpit view
  const hoodStripeGeo = trackGeo(new THREE.BoxGeometry(stripeW * 0.9, 0.035, length * 0.34));
  const hoodStripeMesh = new THREE.Mesh(hoodStripeGeo, secondaryMat);
  hoodStripeMesh.position.set(0, height * 0.41, -halfL * 0.56);
  hoodStripeMesh.rotation.x = 0.14;
  hoodStripeMesh.visible = false;
  bodyGroup.add(hoodStripeMesh);

  // 4. Tinted glass cabin canopy
  const canopyW = customization.carId === 'formula' ? 0.56 : bodyWidth * 0.78;
  const canopyH = customization.carId === 'juggernaut' ? height * 0.42 : height * 0.46;
  const canopyL = customization.carId === 'formula' ? 0.95 : length * 0.44;
  const canopyGeo = trackGeo(new THREE.BoxGeometry(canopyW, canopyH, canopyL));
  const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
  canopyMesh.position.set(0, height * 0.64, customization.carId === 'hyperion' ? -0.15 : 0.2);
  bodyGroup.add(canopyMesh);

  // 5. Car-specific bespoke hardware & aero details
  const addWing = (yPos: number, zPos: number, span: number, chord = 0.38, pylonH = 0.34) => {
    const wingBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(span, 0.07, chord)), secondaryMat);
    wingBlade.position.set(0, yPos, zPos);
    wingBlade.rotation.x = 0.14;
    wingBlade.castShadow = true;
    bodyGroup.add(wingBlade);

    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, pylonH, 0.22)), darkChassisMat);
      pylon.position.set(side * span * 0.3, yPos - pylonH * 0.5, zPos + 0.04);
      bodyGroup.add(pylon);
    }
  };

  if (customization.carId === 'striker') {
    addWing(height * 0.68, halfL - 0.18, width * 0.94, 0.36, 0.3);
    // Twin hood vents
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.08, 0.68)), darkChassisMat);
      vent.position.set(side * 0.38, height * 0.44, -halfL * 0.42);
      bodyGroup.add(vent);
    }
  } else if (customization.carId === 'nomad') {
    addWing(height * 1.15, halfL - 0.12, width * 0.96, 0.44, 0.52);
    // Roof LED bar
    const bar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width * 0.58, 0.1, 0.14)), headlightMat);
    bar.position.set(0, height * 1.06, -0.1);
    bodyGroup.add(bar);
  } else if (customization.carId === 'hyperion') {
    // Dorsal aero fin + active split wing
    const fin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.35, 1.35)), secondaryMat);
    fin.position.set(0, height * 0.72, halfL * 0.35);
    bodyGroup.add(fin);
    addWing(height * 0.78, halfL - 0.16, width * 0.92, 0.42, 0.38);
  } else if (customization.carId === 'bullitt') {
    // Chrome V8 supercharger blower protruding from hood
    const blower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.28, 0.72)), chromeMat);
    blower.position.set(0, height * 0.62, -halfL * 0.42);
    bodyGroup.add(blower);
    const intake = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.14, 0.24)), secondaryMat);
    intake.position.set(0, height * 0.76, -halfL * 0.52);
    bodyGroup.add(intake);
  } else if (customization.carId === 'rallyx') {
    addWing(height * 1.08, halfL - 0.15, width * 0.88, 0.36, 0.22);
    // Roof scoop + 4 rally fog lights
    const scoop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.16, 0.5)), secondaryMat);
    scoop.position.set(0, height * 1.06, 0.05);
    bodyGroup.add(scoop);
    for (let i = -1.5; i <= 1.5; i += 1) {
      const lamp = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12)), headlightMat);
      lamp.rotation.x = Math.PI * 0.5;
      lamp.position.set(i * 0.28, height * 0.34, -halfL + 0.04);
      bodyGroup.add(lamp);
    }
  } else if (customization.carId === 'apex_s') {
    addWing(height * 0.82, halfL - 0.12, width * 0.95, 0.4, 0.36);
    for (const side of [-1, 1]) {
      const sidePod = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.34, 1.55)), secondaryMat);
      sidePod.position.set(side * (bodyWidth * 0.52), 0.16, 0.2);
      bodyGroup.add(sidePod);
    }
  } else if (customization.carId === 'formula') {
    // Wide multi-element front wing + rear wing + cockpit halo + sidepods
    const frontWing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width * 1.06, 0.08, 0.56)), secondaryMat);
    frontWing.position.set(0, -0.1, -halfL + 0.12);
    bodyGroup.add(frontWing);
    addWing(height * 0.92, halfL - 0.15, width * 0.9, 0.48, 0.42);
    const halo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.32, 0.045, 8, 16, Math.PI)), darkChassisMat);
    halo.rotation.x = Math.PI * 0.5;
    halo.position.set(0, height * 0.82, -0.15);
    bodyGroup.add(halo);
    for (const side of [-1, 1]) {
      const sidepod = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.36, 1.65)), primaryMat);
      sidepod.position.set(side * 0.54, 0.08, 0.25);
      bodyGroup.add(sidepod);
    }
  } else if (customization.carId === 'juggernaut') {
    // Heavy armored bullbar + side armor plates
    const bullbar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width * 0.98, 0.44, 0.24)), chromeMat);
    bullbar.position.set(0, 0.02, -halfL - 0.05);
    bodyGroup.add(bullbar);
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.28, length * 0.72)), secondaryMat);
      bar.position.set(side * (bodyWidth * 0.52), 0.12, 0);
      bodyGroup.add(bar);
    }
  } else if (customization.carId === 'volt') {
    // Glowing light-blade front & rear + clean aero skirts
    const frontBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width * 0.86, 0.09, 0.12)), headlightMat);
    frontBlade.position.set(0, 0.18, -halfL + 0.02);
    bodyGroup.add(frontBlade);
    const rearBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width * 0.86, 0.09, 0.12)), taillightMat);
    rearBlade.position.set(0, 0.42, halfL - 0.02);
    bodyGroup.add(rearBlade);
  } else {
    // Drift / Kitsune RS widebody arches + GT wing
    addWing(height * 0.86, halfL - 0.16, width * 0.96, 0.38, 0.38);
  }

  // 6. Standard Headlights & Taillights
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.1)), headlightMat);
    hl.position.set(side * (bodyWidth * 0.34), 0.16, -halfL + 0.02);
    bodyGroup.add(hl);

    const tl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.12, 0.1)), taillightMat);
    tl.position.set(side * (bodyWidth * 0.34), 0.26, halfL - 0.02);
    bodyGroup.add(tl);
  }

  // 7. Twin Rocket Exhaust Nozzles & Dynamic Boost Flames
  const trailDef = BOOST_TRAIL_CATALOG.find((t) => t.id === customization.boostTrail) ?? BOOST_TRAIL_CATALOG[0];
  const flameOuterMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(trailDef.outerColor),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const flameCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(trailDef.coreColor),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const flameMeshes: THREE.Mesh[] = [];
  const exhaustOffsets = customization.carId === 'formula' ? [0] : [-0.36, 0.36];

  for (const ex of exhaustOffsets) {
    const nozzle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.26, 12)), chromeMat);
    nozzle.rotation.x = Math.PI * 0.5;
    nozzle.position.set(ex, 0.02, halfL + 0.04);
    bodyGroup.add(nozzle);

    const outerConeGeo = trackGeo(new THREE.ConeGeometry(0.24, 1.85, 12));
    outerConeGeo.translate(0, -0.92, 0);
    outerConeGeo.rotateX(-Math.PI * 0.5);
    const outerFlame = new THREE.Mesh(outerConeGeo, flameOuterMat);
    outerFlame.position.set(ex, 0.02, halfL + 0.14);
    outerFlame.visible = false;
    bodyGroup.add(outerFlame);
    flameMeshes.push(outerFlame);

    const coreConeGeo = trackGeo(new THREE.ConeGeometry(0.12, 1.15, 10));
    coreConeGeo.translate(0, -0.57, 0);
    coreConeGeo.rotateX(-Math.PI * 0.5);
    const coreFlame = new THREE.Mesh(coreConeGeo, flameCoreMat);
    coreFlame.position.set(ex, 0.02, halfL + 0.14);
    coreFlame.visible = false;
    bodyGroup.add(coreFlame);
    flameMeshes.push(coreFlame);
  }

  let boostLight: THREE.PointLight | null = null;
  if (options?.enablePointLights) {
    boostLight = new THREE.PointLight(new THREE.Color(trailDef.outerColor), 0, 14, 2);
    boostLight.position.set(0, 0.25, halfL + 0.8);
    bodyGroup.add(boostLight);
  }

  // 8. Four Detailed Wheel Assemblies (FL, FR, RL, RR)
  const wheelSteerPivots: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];

  const wheelX = halfW - wheelWidth * 0.32;
  const wheelZFront = -halfL * 0.64;
  const wheelZRear = halfL * 0.62;
  const wheelY = -height * 0.28;

  const wheelConfigs = [
    { x: -wheelX, z: wheelZFront, isFront: true },
    { x: wheelX, z: wheelZFront, isFront: true },
    { x: -wheelX, z: wheelZRear, isFront: false },
    { x: wheelX, z: wheelZRear, isFront: false },
  ];

  const tireGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20));
  tireGeo.rotateZ(Math.PI * 0.5);

  const rimGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius * 0.64, wheelRadius * 0.64, wheelWidth + 0.02, 16));
  rimGeo.rotateZ(Math.PI * 0.5);

  const hubGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius * 0.24, wheelRadius * 0.24, wheelWidth + 0.04, 10));
  hubGeo.rotateZ(Math.PI * 0.5);

  const spokeGeo = trackGeo(new THREE.BoxGeometry(wheelWidth + 0.03, wheelRadius * 1.16, 0.07));

  for (const wc of wheelConfigs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wc.x, wheelY, wc.z);
    root.add(steerPivot);
    if (wc.isFront) {
      wheelSteerPivots.push(steerPivot);
    }

    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(rimGeo, chromeMat);
    spinGroup.add(rim);

    const hub = new THREE.Mesh(hubGeo, secondaryMat);
    spinGroup.add(hub);

    // 3-spoke alloy wheel detail so spin is super crisp
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeo, darkChassisMat);
      spoke.rotation.x = (s / 3) * Math.PI;
      spinGroup.add(spoke);
    }
  }

  // 9. Rear-Deck Car Accessories (crown, halo, shark_fin, rocket_pod, antennas)
  const accessoryGroups: Record<string, THREE.Group> = {};
  const deckY = height * 0.88;
  const deckZ = halfL * 0.28;

  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.92,
      roughness: 0.16,
      emissive: 0x78350f,
      emissiveIntensity: 0.35,
    })
  );

  // Crown
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, deckY + 0.14, deckZ - 0.1);
  const crownBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.26, 0.22, 0.14, 8)), goldMat);
  crownGroup.add(crownBase);
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.055, 0.18, 5)), goldMat);
    spike.position.set(Math.cos(a) * 0.19, 0.14, Math.sin(a) * 0.19);
    crownGroup.add(spike);
  }
  bodyGroup.add(crownGroup);
  accessoryGroups.crown = crownGroup;

  // Ion Halo
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, deckY + 0.28, deckZ - 0.15);
  const haloMesh = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.38, 0.045, 10, 28)),
    headlightMat
  );
  haloMesh.rotation.x = Math.PI * 0.5;
  haloGroup.add(haloMesh);
  bodyGroup.add(haloGroup);
  accessoryGroups.halo = haloGroup;

  // Aero Dorsal Shark Fin
  const finGroup = new THREE.Group();
  finGroup.position.set(0, deckY + 0.06, deckZ + 0.12);
  const dorsalFin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.34, 0.85)), secondaryMat);
  dorsalFin.rotation.x = -0.15;
  finGroup.add(dorsalFin);
  bodyGroup.add(finGroup);
  accessoryGroups.shark_fin = finGroup;

  // Twin Turbo Pods
  const podGroup = new THREE.Group();
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 0.62, 12)), chromeMat);
    pod.rotation.x = Math.PI * 0.5;
    pod.position.set(side * (bodyWidth * 0.38), deckY - 0.08, deckZ + 0.18);
    podGroup.add(pod);
    const tip = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10)), headlightMat);
    tip.rotation.x = Math.PI * 0.5;
    tip.position.set(side * (bodyWidth * 0.38), deckY - 0.08, deckZ - 0.14);
    podGroup.add(tip);
  }
  bodyGroup.add(podGroup);
  accessoryGroups.rocket_pod = podGroup;

  // Telemetry Whip Antennas
  const antGroup = new THREE.Group();
  for (const side of [-1, 1]) {
    const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.024, 0.72, 6)), darkChassisMat);
    mast.position.set(side * (bodyWidth * 0.38), deckY + 0.18, halfL * 0.72);
    mast.rotation.x = -0.22;
    antGroup.add(mast);
    const orb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.05, 8, 8)), headlightMat);
    orb.position.set(side * (bodyWidth * 0.38), deckY + 0.52, halfL * 0.72 - 0.08);
    antGroup.add(orb);
  }
  bodyGroup.add(antGroup);
  accessoryGroups.antennas = antGroup;

  let currentAccessory = customization.accessory ?? 'none';
  let inFirstPerson = false;
  const syncAccessories = () => {
    for (const [accId, grp] of Object.entries(accessoryGroups)) {
      grp.visible = !inFirstPerson && accId === currentAccessory;
    }
  };
  syncAccessories();

  return {
    root,
    bodyGroup,
    wheelSteerPivots,
    wheelSpinGroups,
    flameMeshes,
    boostLight,
    updateAppearance(next: CarCustomization) {
      primaryMat.color.set(next.primaryColor);
      secondaryMat.color.set(next.secondaryColor);
      const t = BOOST_TRAIL_CATALOG.find((item) => item.id === next.boostTrail) ?? BOOST_TRAIL_CATALOG[0];
      flameOuterMat.color.set(t.outerColor);
      flameCoreMat.color.set(t.coreColor);
      if (boostLight) {
        boostLight.color.set(t.outerColor);
      }
      currentAccessory = next.accessory ?? 'none';
      syncAccessories();
    },
    updateDynamicState({ steerAngle, wheelSpin, isBoosting, throttle, time }) {
      for (const p of wheelSteerPivots) {
        p.rotation.y = steerAngle;
      }
      for (const w of wheelSpinGroups) {
        w.rotation.x = -wheelSpin;
      }
      taillightMat.emissiveIntensity = throttle < -0.1 ? 3.8 : 1.4;

      const flicker = 0.85 + Math.sin(time * 48) * 0.18 + Math.cos(time * 73) * 0.1;
      for (let i = 0; i < flameMeshes.length; i++) {
        const fm = flameMeshes[i];
        fm.visible = isBoosting;
        if (isBoosting) {
          fm.scale.set(0.95 + (flicker - 1) * 0.3, 0.95 + (flicker - 1) * 0.3, flicker);
        }
      }
      if (boostLight) {
        boostLight.intensity = isBoosting ? 4.5 * flicker : 0;
      }
      if (haloGroup.visible) {
        haloGroup.position.y = deckY + 0.28 + Math.sin(time * 3.5) * 0.03;
      }
    },
    setFirstPersonMode(enabled: boolean) {
      inFirstPerson = enabled;
      canopyMesh.visible = !enabled;
      stripeMesh.visible = !enabled;
      hoodStripeMesh.visible = enabled;
      syncAccessories();
    },
    dispose() {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    },
  };
}

export function getTrailColors(trailId: BoostTrailId): { core: string; outer: string } {
  const t = BOOST_TRAIL_CATALOG.find((item) => item.id === trailId) ?? BOOST_TRAIL_CATALOG[0];
  return { core: t.coreColor, outer: t.outerColor };
}
