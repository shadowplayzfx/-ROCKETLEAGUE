import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { CarCustomization } from '../shared/types.ts';
import { createCarModel, type CarMeshHandle } from './carModels.ts';
import { createContactShadowTexture } from './textures.ts';

interface GarageShowcase3DProps {
  customization: CarCustomization;
  interactive: boolean;
  previewBoost?: boolean;
  offsetX?: number;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export const GarageShowcase3D: React.FC<GarageShowcase3DProps> = ({
  customization,
  interactive,
  previewBoost = false,
  offsetX = 0,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const customRef = useRef(customization);
  customRef.current = customization;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const boostRef = useRef(previewBoost);
  boostRef.current = previewBoost;
  const offsetXRef = useRef(offsetX);
  offsetXRef.current = offsetX;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a10);
    scene.fog = new THREE.FogExp2(0x070a10, 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(4.8, 2.2, 5.4);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 3.6;
    controls.maxDistance = 9.5;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0.55, 0);

    // 3-Point Showroom Lighting + Studio Softboxes
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0b101b, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1e0, 2.4);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.4);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xe0f2fe, 4.5, 6, 1.8);
      softbox.position.set(0, 4.8, 0);
      softbox.lookAt(0, 0, 0);
      scene.add(softbox);
    }

    // Showroom Floor & Illuminated Turntable Plinth
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    floorGeo.rotateX(-Math.PI * 0.5);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.35,
      metalness: 0.55,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    scene.add(floor);

    const plinthGeo = new THREE.CylinderGeometry(3.2, 3.5, 0.16, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.25,
      metalness: 0.85,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = 0.08;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const plinthRingGeo = new THREE.TorusGeometry(3.26, 0.035, 10, 64);
    plinthRingGeo.rotateX(Math.PI * 0.5);
    const plinthRingMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.0,
    });
    const plinthRing = new THREE.Mesh(plinthRingGeo, plinthRingMat);
    plinthRing.position.y = 0.165;
    scene.add(plinthRing);

    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(3.5, 5.4);
    shadowGeo.rotateX(-Math.PI * 0.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.y = 0.175;
    scene.add(shadowPlane);

    const carContainer = new THREE.Group();
    carContainer.position.y = 0.72;
    scene.add(carContainer);

    let currentCarId = '';
    let currentCustomKey = '';
    let carHandle: CarMeshHandle | null = null;

    const ensureCarModel = () => {
      const cfg = customRef.current;
      const key = `${cfg.carId}_${cfg.primaryColor}_${cfg.secondaryColor}_${cfg.boostTrail}`;
      if (currentCarId !== cfg.carId) {
        if (carHandle) {
          carContainer.remove(carHandle.root);
          carHandle.dispose();
        }
        carHandle = createCarModel(cfg, { enablePointLights: !isSoftwareGl });
        carContainer.add(carHandle.root);
        currentCarId = cfg.carId;
        currentCustomKey = key;
      } else if (currentCustomKey !== key && carHandle) {
        carHandle.updateAppearance(cfg);
        currentCustomKey = key;
      }
    };

    ensureCarModel();

    let wheelSpin = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let frameId = 0;
    let disposed = false;

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;

      ensureCarModel();

      controls.enabled = interactiveRef.current;
      controls.autoRotate = !isSoftwareGl && !interactiveRef.current;
      controls.autoRotateSpeed = 0.8;

      // Subtle shift when menu drawer sits on left
      const desiredTargetX = offsetXRef.current;
      controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTargetX, 6, dt);
      controls.update();

      if (carHandle) {
        if (interactiveRef.current) {
          carContainer.rotation.y += dt * 0.25;
        }
        wheelSpin += dt * (boostRef.current ? 16 : 2.2);
        carHandle.updateDynamicState({
          steerAngle: Math.sin(elapsed * 0.8) * 0.18,
          wheelSpin,
          isBoosting: boostRef.current,
          throttle: boostRef.current ? 1 : 0,
          time: elapsed,
        });
      }

      plinthRingMat.color.set(customRef.current.primaryColor);
      plinthRingMat.emissive.set(customRef.current.primaryColor);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      carHandle?.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      plinthRingGeo.dispose();
      plinthRingMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
};
