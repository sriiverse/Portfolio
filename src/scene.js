/**
 * scene.js — Three.js hero scene.
 * "A futuristic AI laboratory floating in deep space."
 *  - Starfield (3 layers, parallax)
 *  - Nebula (additive sprites)
 *  - Holographic wireframe sphere with inner icosahedron core
 *  - Orbiting particle rings
 *  - Mouse parallax on the whole group
 */
import * as THREE from 'three';

export function initScene(canvas) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050816, 0.018);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 18);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const root = new THREE.Group();
  scene.add(root);

  /* ---------- STARFIELD (3 parallax layers) ---------- */
  const starLayers = [];
  const makeStars = (count, spread, size, color, depth) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.position.z = depth;
    root.add(points);
    starLayers.push(points);
    return points;
  };
  makeStars(1400, 140, 0.18, 0xffffff, -30);
  makeStars(800,  100, 0.28, 0x9aa3ff, -18);
  makeStars(300,  70,  0.45, 0x6C63FF, -8);

  /* ---------- NEBULA (additive sprites) ---------- */
  const makeNebulaTexture = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  };
  const nebulaTex = makeNebulaTexture();
  const nebulaColors = [0x6C63FF, 0x38BDF8, 0x7C3AED, 0x4F46E5];
  const nebulae = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({
      map: nebulaTex,
      color: nebulaColors[i % nebulaColors.length],
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    const scale = 18 + Math.random() * 22;
    s.scale.set(scale, scale, 1);
    s.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, -25 - Math.random() * 20);
    root.add(s);
    nebulae.push(s);
  }

  /* ---------- HOLOGRAPHIC CORE ---------- */
  const core = new THREE.Group();
  core.position.set(0, 0, 0);
  root.add(core);

  // Outer wireframe icosahedron
  const outerGeo = new THREE.IcosahedronGeometry(4.6, 1);
  const outerMat = new THREE.MeshBasicMaterial({ color: 0x6C63FF, wireframe: true, transparent: true, opacity: 0.32 });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  core.add(outer);

  // Mid icosahedron — sky tint
  const midGeo = new THREE.IcosahedronGeometry(3.2, 0);
  const midMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8, wireframe: true, transparent: true, opacity: 0.22 });
  const mid = new THREE.Mesh(midGeo, midMat);
  core.add(mid);

  // Inner glowing sphere (the "AI core")
  const innerGeo = new THREE.IcosahedronGeometry(1.8, 2);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x7C3AED, transparent: true, opacity: 0.55 });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  core.add(inner);

  // Innermost solid glow point
  const dotGeo = new THREE.SphereGeometry(0.6, 24, 24);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  core.add(dot);

  /* ---------- ORBITING PARTICLE RINGS ---------- */
  const makeRing = (radius, count, color, tilt) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const r = radius + (Math.random() - 0.5) * 0.6;
      pos[i * 3]     = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Points(geo, mat);
    ring.rotation.x = tilt;
    core.add(ring);
    return ring;
  };
  const ring1 = makeRing(6.2, 220, 0x6C63FF, Math.PI / 3);
  const ring2 = makeRing(7.4, 180, 0x38BDF8, -Math.PI / 4);
  const ring3 = makeRing(8.8, 140, 0x7C3AED, Math.PI / 6);

  /* ---------- FLOATING DUST (foreground depth) ---------- */
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 400;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3]     = (Math.random() - 0.5) * 40;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 40;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* ---------- MOUSE PARALLAX ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  /* ---------- SCROLL-DRIVEN RECEDSION ---------- */
  let scrollY = 0;
  const onScroll = () => { scrollY = window.scrollY || window.pageYOffset; };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- RESIZE ---------- */
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', onResize);

  /* ---------- ANIMATE ---------- */
  const clock = new THREE.Clock();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    // Smooth mouse follow
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    if (!reducedMotion) {
      // Whole scene parallax
      root.rotation.y = mouse.x * 0.18;
      root.rotation.x = mouse.y * 0.12;
      root.position.x = -mouse.x * 0.6;
      root.position.y = mouse.y * 0.4;

      // Core rotation
      outer.rotation.y = t * 0.12;
      outer.rotation.x = t * 0.05;
      mid.rotation.y = -t * 0.18;
      mid.rotation.z = t * 0.07;
      inner.rotation.y = t * 0.3;
      inner.rotation.x = t * 0.2;

      // Pulsing glow
      const pulse = 1 + Math.sin(t * 1.5) * 0.05;
      inner.scale.setScalar(pulse);
      dot.scale.setScalar(0.8 + Math.sin(t * 3) * 0.2);

      // Rings rotate on their axes
      ring1.rotation.y = t * 0.25;
      ring2.rotation.y = -t * 0.2;
      ring3.rotation.y = t * 0.15;

      // Starfield slow drift
      starLayers.forEach((s, i) => { s.rotation.y = t * (0.005 + i * 0.004); });

      // Nebula breathing
      nebulae.forEach((n, i) => {
        n.material.opacity = 0.12 + Math.sin(t * 0.5 + i) * 0.06;
      });

      dust.rotation.y = t * 0.01;
    }

    // Scroll: push scene back + fade as user leaves hero
    const progress = Math.min(scrollY / window.innerHeight, 1);
    core.position.y = progress * 6;
    camera.position.z = 18 + progress * 4;
    renderer.toneMappingExposure = 1 - progress * 0.4;

    renderer.render(scene, camera);
  }
  animate();

  // Expose a small API
  return {
    destroy() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
