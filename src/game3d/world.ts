import * as THREE from 'three';
import { Question } from '../types/game';
import { createTextTexture, createPlatformTexture } from './textures';

export interface GroundCollider {
  box: THREE.Box3;
  mesh?: THREE.Mesh;
}

export interface TriggerZone {
  type: 'GATE' | 'FLOOR' | 'SWITCH' | 'CHECKPOINT' | 'FINISH';
  box: THREE.Box3;
  spCode: 'SP 4.4.1' | 'SP 4.4.2' | 'SP 4.4.3' | 'SP 4.4.4' | 'NONE';
  questionGlobalIndex: number; // 0..15 (-1 for checkpoints/finish)
  optionIndex: number; // 0 (A), 1 (B), 2 (C)
  label: string;
}

export interface MovingPlatformData {
  mesh: THREE.Mesh;
  initialY: number;
  initialX: number;
  axis: 'x' | 'y';
  speed: number;
  amplitude: number;
  offset: number;
  collider: GroundCollider;
  trigger?: TriggerZone;
}

export interface FallingTileData {
  mesh: THREE.Mesh;
  initialY: number;
  isFalling: boolean;
  fallSpeed: number;
  collider: GroundCollider;
  qIndex: number;
  optIndex: number;
}

export class WorldManager {
  public scene: THREE.Scene;
  public groundColliders: GroundCollider[] = [];
  public triggerZones: TriggerZone[] = [];
  public movingPlatforms: MovingPlatformData[] = [];
  public fallingTiles: FallingTileData[] = [];
  public signs: { [key: string]: { mesh: THREE.Mesh; badge: string; qIndex: number; optIndex: number } } = {};
  public trophyMesh: THREE.Group | null = null;
  public confettiParticles: THREE.Points | null = null;
  public questionCheckpoints: THREE.Vector3[] = [];
  public spCheckpoints: { [key: string]: THREE.Vector3 } = {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildEnvironment();
    this.buildWorldGeometry();
  }

  private buildEnvironment() {
    this.scene.background = new THREE.Color(0x60A5FA); // Sky blue
    this.scene.fog = new THREE.Fog(0x60A5FA, 80, 420);

    // Warm Sun Directional Light
    const sunLight = new THREE.DirectionalLight(0xFFFBEB, 1.4);
    sunLight.position.set(50, 70, -20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 900;
    const d = 70;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Cool Sky / Warm Ground Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0xBAE6FD, 0xFEF08A, 0.75);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.4);
    this.scene.add(ambientLight);

    this.createClouds();
    this.createDistantIslands();
  }

  private createClouds() {
    const cloudGeo = new THREE.DodecahedronGeometry(5, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.9,
      metalness: 0.05,
      transparent: true,
      opacity: 0.9
    });

    for (let i = 0; i < 35; i++) {
      const cloudGroup = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 8
        );
        const scale = 0.8 + Math.random() * 0.7;
        puff.scale.set(scale, scale * 0.65, scale);
        cloudGroup.add(puff);
      }

      cloudGroup.position.set(
        (Math.random() - 0.5) * 260,
        28 + Math.random() * 25,
        -30 + i * 26 + (Math.random() - 0.5) * 15
      );
      this.scene.add(cloudGroup);
    }
  }

  private createDistantIslands() {
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x86EFAC, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.95 });

    for (let i = 0; i < 18; i++) {
      const island = new THREE.Group();
      const side = (i % 2 === 0 ? 1 : -1) * (50 + Math.random() * 30);
      const zPos = i * 48;

      const topGeo = new THREE.CylinderGeometry(8, 12, 4, 7);
      const topMesh = new THREE.Mesh(topGeo, islandMat);
      island.add(topMesh);

      const bottomGeo = new THREE.ConeGeometry(12, 16, 7);
      const bottomMesh = new THREE.Mesh(bottomGeo, rockMat);
      bottomMesh.rotation.x = Math.PI;
      bottomMesh.position.y = -8;
      island.add(bottomMesh);

      island.position.set(side, -15 + Math.random() * 10, zPos);
      this.scene.add(island);
    }
  }

  public addGroundCollider(mesh: THREE.Mesh): GroundCollider {
    mesh.updateMatrixWorld(true);
    let box: THREE.Box3;
    if (mesh.geometry instanceof THREE.BoxGeometry) {
      const params = mesh.geometry.parameters;
      const hw = params.width / 2;
      const hh = params.height / 2;
      const hd = params.depth / 2;
      box = new THREE.Box3(
        new THREE.Vector3(mesh.position.x - hw, mesh.position.y - hh, mesh.position.z - hd),
        new THREE.Vector3(mesh.position.x + hw, mesh.position.y + hh, mesh.position.z + hd)
      );
    } else {
      box = new THREE.Box3().setFromObject(mesh);
    }
    const collider: GroundCollider = { box, mesh };
    this.groundColliders.push(collider);
    return collider;
  }

  private buildWorldGeometry() {
    // Platform texturing
    const startTex = createPlatformTexture('#3B82F6', '#1D4ED8'); // Spawn Hub
    const sp1Tex = createPlatformTexture('#10B981', '#059669');   // SP 4.4.1 (Emerald)
    const sp2Tex = createPlatformTexture('#0284C7', '#0369A1');   // SP 4.4.2 (Sky)
    const sp3Tex = createPlatformTexture('#D97706', '#B45309');   // SP 4.4.3 (Amber)
    const sp4Tex = createPlatformTexture('#7C3AED', '#6D28D9');   // SP 4.4.4 (Purple)
    const goldTex = createPlatformTexture('#EAB308', '#CA8A04');  // Victory (Gold)

    for (let i = 0; i < 16; i++) {
      this.questionCheckpoints.push(new THREE.Vector3(0, 1.2, 0));
    }

    // Direction alignment:
    // Looking along +Z:
    // -X is on the viewer's RIGHT.
    // 0.0 is in the CENTER.
    // +X is on the viewer's LEFT.
    // User requested: "Tukar jawapan A ke kanan dan C kekiri"
    // Index 0 ([A]): -5.2 (Screen RIGHT)
    // Index 1 ([B]): 0.0 (Screen CENTER)
    // Index 2 ([C]): +5.2 (Screen LEFT)
    const xOffsets = [-5.2, 0.0, 5.2];
    const badges = ['A', 'B', 'C'];

    // =========================================================================
    // 0. GRAND STARTING HUB PLATFORM (SP 1 STARTING POINT)
    // =========================================================================
    const startPlatform = new THREE.Mesh(
      new THREE.BoxGeometry(22, 2.5, 38),
      new THREE.MeshStandardMaterial({ map: startTex, roughness: 0.5, metalness: 0.1 })
    );
    startPlatform.position.set(0, -1.25, -9);
    startPlatform.receiveShadow = true;
    this.scene.add(startPlatform);
    this.addGroundCollider(startPlatform);
    this.createSideFences(-26, 34, 22);

    // Glowing Spawn Circle at Hub (Player spawns here initially and on return to menu)
    this.createSpawnCircle(new THREE.Vector3(0, 0, -12), 0x38BDF8);
    this.createFlagPole(new THREE.Vector3(-8, 0, -12), 'MULA', 0x38BDF8);
    this.createFlagPole(new THREE.Vector3(8, 0, -12), 'MULA', 0x38BDF8);

    // Grand Entrance Archway into Math Obby at Z = 2
    this.createGrandEntranceArch(new THREE.Vector3(0, 0, 2), 'PINTU MULA: PUSINGAN 1');

    // Start Gate Trigger Zone
    const startTriggerBox = new THREE.Box3(
      new THREE.Vector3(-8.0, 0, 0.5),
      new THREE.Vector3(8.0, 6.0, 4.5)
    );
    this.triggerZones.push({
      type: 'CHECKPOINT',
      box: startTriggerBox,
      spCode: 'NONE',
      questionGlobalIndex: -1,
      optionIndex: 0,
      label: 'START_GATE'
    });

    // Pusingan 1 Starting Checkpoint — directly at runway facing Question 1!
    this.createSpawnCircle(new THREE.Vector3(0, 0, 6), 0x10B981);
    this.createFlagPole(new THREE.Vector3(-7, 0, 6), 'PUSINGAN 1', 0x10B981);
    this.spCheckpoints['SP 4.4.1'] = new THREE.Vector3(0, 1.2, 6);
    this.questionCheckpoints[0] = new THREE.Vector3(0, 1.2, 6);

    // Continuous runway from Start Gate to Question 1
    const startRunway = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.5, 18),
      new THREE.MeshStandardMaterial({ map: sp1Tex, roughness: 0.6 })
    );
    startRunway.position.set(0, -1.25, 17);
    startRunway.receiveShadow = true;
    this.scene.add(startRunway);
    this.addGroundCollider(startRunway);
    this.createSideFences(8, 18, 16);

    // =========================================================================
    // 1. ZONE 1: SP 4.4.1 (RATIO GATE) — Soalan 1 hingga 4
    // =========================================================================
    let currentZ = 26;

    for (let q = 0; q < 4; q++) {
      const qIndex = q; // 0, 1, 2, 3
      const stageStartZ = currentZ;

      this.questionCheckpoints[qIndex] = new THREE.Vector3(0, 1.2, stageStartZ + 2);

      // Floor Platform
      const stageFloor = new THREE.Mesh(
        new THREE.BoxGeometry(18, 2.5, 34),
        new THREE.MeshStandardMaterial({ map: sp1Tex, roughness: 0.6 })
      );
      stageFloor.position.set(0, -1.25, stageStartZ + 15);
      stageFloor.receiveShadow = true;
      this.scene.add(stageFloor);
      this.addGroundCollider(stageFloor);
      this.createSideFences(stageStartZ - 1, 34, 18);

      // 3 Gates: A (+5.2: Left), B (0: Center), C (-5.2: Right)
      const gateZ = stageStartZ + 16;
      for (let opt = 0; opt < 3; opt++) {
        const xPos = xOffsets[opt];
        const badge = badges[opt];

        this.createGateArch(new THREE.Vector3(xPos, 0, gateZ), badge, qIndex, opt);

        const triggerBox = new THREE.Box3(
          new THREE.Vector3(xPos - 2.1, 0, gateZ - 1.0),
          new THREE.Vector3(xPos + 2.1, 4.5, gateZ + 1.0)
        );
        this.triggerZones.push({
          type: 'GATE',
          box: triggerBox,
          spCode: 'SP 4.4.1',
          questionGlobalIndex: qIndex,
          optionIndex: opt,
          label: `SP 4.4.1 Soalan ${qIndex + 1} Pintu ${badge}`
        });
      }

      // Connecting runway past gate to next question
      const exitBridge = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 16),
        new THREE.MeshStandardMaterial({ map: sp1Tex, roughness: 0.6 })
      );
      exitBridge.position.set(0, -1.25, gateZ + 15);
      exitBridge.receiveShadow = true;
      this.scene.add(exitBridge);
      this.addGroundCollider(exitBridge);
      this.createSideFences(gateZ + 7, 16, 16);

      if (q < 3) {
        this.createMiniArch(new THREE.Vector3(0, 0, gateZ + 18), `LULUS SOALAN ${q + 1}`);
      }

      currentZ = gateZ + 23;
    }

    // Direct solid bridge connecting SP 1 to SP 2 Starting Island (NO GAPS!)
    const bridge1to2 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.5, 20),
      new THREE.MeshStandardMaterial({ map: sp2Tex, roughness: 0.6 })
    );
    bridge1to2.position.set(0, -1.25, currentZ + 10);
    this.scene.add(bridge1to2);
    this.addGroundCollider(bridge1to2);
    this.createSideFences(currentZ, 20, 16);

    currentZ += 20;

    // =========================================================================
    // 2. ZONE 2: SP 4.4.2 (RATIO FLOOR) — Soalan 5 hingga 8
    // Dedicated SP 2 Starting Island!
    // =========================================================================
    const sp2StartIsland = new THREE.Mesh(
      new THREE.BoxGeometry(20, 2.5, 24),
      new THREE.MeshStandardMaterial({ map: sp2Tex, roughness: 0.5, metalness: 0.1 })
    );
    sp2StartIsland.position.set(0, -1.25, currentZ + 12);
    this.scene.add(sp2StartIsland);
    this.addGroundCollider(sp2StartIsland);
    this.createSideFences(currentZ, 24, 20);

    this.createSpawnCircle(new THREE.Vector3(0, 0, currentZ + 8), 0x0EA5E9);
    this.createFlagPole(new THREE.Vector3(-7, 0, currentZ + 8), 'PUSINGAN 2', 0x0EA5E9);
    this.createArchway(new THREE.Vector3(0, 0, currentZ + 18), 'PUSINGAN 2: RATIO FLOOR', 0x0284C7);

    // Exact SP 2 Starting Point
    this.spCheckpoints['SP 4.4.2'] = new THREE.Vector3(0, 1.2, currentZ + 8);

    // SP 2 Start Checkpoint Trigger Zone
    const sp2TriggerBox = new THREE.Box3(
      new THREE.Vector3(-10, 0, currentZ + 2),
      new THREE.Vector3(10, 6, currentZ + 20)
    );
    this.triggerZones.push({
      type: 'CHECKPOINT',
      box: sp2TriggerBox,
      spCode: 'SP 4.4.2',
      questionGlobalIndex: -1,
      optionIndex: -1,
      label: 'SP_START_SP 4.4.2'
    });

    currentZ += 24;

    for (let q = 0; q < 4; q++) {
      const qIndex = 4 + q; // 4..7
      this.questionCheckpoints[qIndex] = new THREE.Vector3(0, 1.2, currentZ);

      // Launch ledge
      const ledge = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp2Tex, roughness: 0.6 })
      );
      ledge.position.set(0, -1.25, currentZ + 4);
      ledge.receiveShadow = true;
      this.scene.add(ledge);
      this.addGroundCollider(ledge);

      const platZ = currentZ + 17;

      for (let opt = 0; opt < 3; opt++) {
        const xPos = xOffsets[opt];
        const badge = badges[opt];

        // Platform mesh
        const platMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 2.2, 8.5),
          new THREE.MeshStandardMaterial({
            color: opt === 0 ? 0x0284C7 : opt === 1 ? 0x0369A1 : 0x075985,
            roughness: 0.5
          })
        );
        platMesh.position.set(xPos, -1.1, platZ);
        platMesh.receiveShadow = true;
        platMesh.castShadow = true;
        this.scene.add(platMesh);
        this.addGroundCollider(platMesh);

        this.createPlatformSign(new THREE.Vector3(xPos, 0, platZ + 3.2), badge, qIndex, opt);

        // Immediate responsive trigger zone: strictly on top of tile surface (no premature firing in gap)
        const triggerBox = new THREE.Box3(
          new THREE.Vector3(xPos - 2.0, -0.2, platZ - 2.0),
          new THREE.Vector3(xPos + 2.0, 2.2, platZ + 2.8)
        );
        this.triggerZones.push({
          type: 'FLOOR',
          box: triggerBox,
          spCode: 'SP 4.4.2',
          questionGlobalIndex: qIndex,
          optionIndex: opt,
          label: `SP 4.4.2 Soalan ${qIndex + 1} Lantai ${badge}`
        });
      }

      // Connecting Landing Island (comfortably adjacent, no falling gap!)
      const landingIsland = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp2Tex, roughness: 0.6 })
      );
      landingIsland.position.set(0, -1.25, platZ + 9.5);
      landingIsland.receiveShadow = true;
      this.scene.add(landingIsland);
      this.addGroundCollider(landingIsland);

      currentZ = platZ + 16;
    }

    // Direct solid bridge connecting SP 2 to SP 3 Starting Island (NO GAPS!)
    const bridge2to3 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.5, 20),
      new THREE.MeshStandardMaterial({ map: sp3Tex, roughness: 0.6 })
    );
    bridge2to3.position.set(0, -1.25, currentZ + 10);
    this.scene.add(bridge2to3);
    this.addGroundCollider(bridge2to3);
    this.createSideFences(currentZ, 20, 16);

    currentZ += 20;

    // =========================================================================
    // 3. ZONE 3: SP 4.4.3 (RATE RUSH) — Soalan 9 hingga 12
    // Dedicated SP 3 Starting Island!
    // =========================================================================
    const sp3StartIsland = new THREE.Mesh(
      new THREE.BoxGeometry(20, 2.5, 24),
      new THREE.MeshStandardMaterial({ map: sp3Tex, roughness: 0.5, metalness: 0.1 })
    );
    sp3StartIsland.position.set(0, -1.25, currentZ + 12);
    this.scene.add(sp3StartIsland);
    this.addGroundCollider(sp3StartIsland);
    this.createSideFences(currentZ, 24, 20);

    this.createSpawnCircle(new THREE.Vector3(0, 0, currentZ + 8), 0xF59E0B);
    this.createFlagPole(new THREE.Vector3(-7, 0, currentZ + 8), 'PUSINGAN 3', 0xF59E0B);
    this.createArchway(new THREE.Vector3(0, 0, currentZ + 18), 'PUSINGAN 3: RATE RUSH', 0xD97706);

    // Exact SP 3 Starting Point
    this.spCheckpoints['SP 4.4.3'] = new THREE.Vector3(0, 1.2, currentZ + 8);

    // SP 3 Start Checkpoint Trigger Zone
    const sp3TriggerBox = new THREE.Box3(
      new THREE.Vector3(-10, 0, currentZ + 2),
      new THREE.Vector3(10, 6, currentZ + 20)
    );
    this.triggerZones.push({
      type: 'CHECKPOINT',
      box: sp3TriggerBox,
      spCode: 'SP 4.4.3',
      questionGlobalIndex: -1,
      optionIndex: -1,
      label: 'SP_START_SP 4.4.3'
    });

    currentZ += 24;

    for (let q = 0; q < 4; q++) {
      const qIndex = 8 + q; // 8..11
      this.questionCheckpoints[qIndex] = new THREE.Vector3(0, 1.2, currentZ);

      const ledge = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp3Tex, roughness: 0.6 })
      );
      ledge.position.set(0, -1.25, currentZ + 4);
      ledge.receiveShadow = true;
      this.scene.add(ledge);
      this.addGroundCollider(ledge);

      const platZ = currentZ + 17;

      for (let opt = 0; opt < 3; opt++) {
        const xPos = xOffsets[opt];
        const badge = badges[opt];

        const movingMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 2.2, 8.5),
          new THREE.MeshStandardMaterial({
            color: 0xF59E0B,
            metalness: 0.3,
            roughness: 0.4
          })
        );
        movingMesh.position.set(xPos, -1.1, platZ);
        movingMesh.receiveShadow = true;
        movingMesh.castShadow = true;
        this.scene.add(movingMesh);

        const collider = this.addGroundCollider(movingMesh);

        this.createPlatformSign(new THREE.Vector3(xPos, 0, platZ + 3.2), badge, qIndex, opt, movingMesh);

        const triggerBox = new THREE.Box3(
          new THREE.Vector3(xPos - 2.3, -0.25, platZ - 3.8),
          new THREE.Vector3(xPos + 2.3, 2.8, platZ + 3.8)
        );

        const triggerZone: TriggerZone = {
          type: 'FLOOR',
          box: triggerBox,
          spCode: 'SP 4.4.3',
          questionGlobalIndex: qIndex,
          optionIndex: opt,
          label: `SP 4.4.3 Soalan ${qIndex + 1} Platform Bergerak ${badge}`
        };
        this.triggerZones.push(triggerZone);

        this.movingPlatforms.push({
          mesh: movingMesh,
          initialY: -1.1,
          initialX: xPos,
          axis: opt % 2 === 0 ? 'y' : 'x',
          speed: 1.6 + opt * 0.4,
          amplitude: opt % 2 === 0 ? 0.9 : 1.2,
          offset: opt * 1.5 + qIndex,
          collider,
          trigger: triggerZone
        });
      }

      // Connecting Landing Island (no gap!)
      const landingIsland = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp3Tex, roughness: 0.6 })
      );
      landingIsland.position.set(0, -1.25, platZ + 9.5);
      landingIsland.receiveShadow = true;
      this.scene.add(landingIsland);
      this.addGroundCollider(landingIsland);

      currentZ = platZ + 16;
    }

    // Direct solid bridge connecting SP 3 to SP 4 Starting Island (NO GAPS!)
    const bridge3to4 = new THREE.Mesh(
      new THREE.BoxGeometry(16, 2.5, 20),
      new THREE.MeshStandardMaterial({ map: sp4Tex, roughness: 0.6 })
    );
    bridge3to4.position.set(0, -1.25, currentZ + 10);
    this.scene.add(bridge3to4);
    this.addGroundCollider(bridge3to4);
    this.createSideFences(currentZ, 20, 16);

    currentZ += 20;

    // =========================================================================
    // 4. ZONE 4: SP 4.4.4 (FALLING TILES) — Soalan 13 hingga 16
    // Dedicated SP 4 Starting Island!
    // Requested: "tukar kepada falling tile dimana jika berpijak pada jawapan yang salah,
    // lantai akan terjatuh dan pemain mula balik dari starting point sp 4"
    // =========================================================================
    const sp4StartIsland = new THREE.Mesh(
      new THREE.BoxGeometry(20, 2.5, 24),
      new THREE.MeshStandardMaterial({ map: sp4Tex, roughness: 0.5, metalness: 0.1 })
    );
    sp4StartIsland.position.set(0, -1.25, currentZ + 12);
    this.scene.add(sp4StartIsland);
    this.addGroundCollider(sp4StartIsland);
    this.createSideFences(currentZ, 24, 20);

    this.createSpawnCircle(new THREE.Vector3(0, 0, currentZ + 8), 0xA855F7);
    this.createFlagPole(new THREE.Vector3(-7, 0, currentZ + 8), 'PUSINGAN 4', 0xA855F7);
    this.createArchway(new THREE.Vector3(0, 0, currentZ + 18), 'PUSINGAN 4: FALLING TILES', 0x7C3AED);

    // Exact SP 4 Starting Point
    this.spCheckpoints['SP 4.4.4'] = new THREE.Vector3(0, 1.2, currentZ + 8);

    // SP 4 Start Checkpoint Trigger Zone
    const sp4TriggerBox = new THREE.Box3(
      new THREE.Vector3(-10, 0, currentZ + 2),
      new THREE.Vector3(10, 6, currentZ + 20)
    );
    this.triggerZones.push({
      type: 'CHECKPOINT',
      box: sp4TriggerBox,
      spCode: 'SP 4.4.4',
      questionGlobalIndex: -1,
      optionIndex: -1,
      label: 'SP_START_SP 4.4.4'
    });

    currentZ += 24;

    for (let q = 0; q < 4; q++) {
      const qIndex = 12 + q; // 12..15
      this.questionCheckpoints[qIndex] = new THREE.Vector3(0, 1.2, currentZ);

      // Launch ledge
      const ledge = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp4Tex, roughness: 0.6 })
      );
      ledge.position.set(0, -1.25, currentZ + 4);
      ledge.receiveShadow = true;
      this.scene.add(ledge);
      this.addGroundCollider(ledge);

      const tileZ = currentZ + 17;

      for (let opt = 0; opt < 3; opt++) {
        const xPos = xOffsets[opt];
        const badge = badges[opt];

        // Falling Tile platform mesh
        const tileMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 1.8, 8.5),
          new THREE.MeshStandardMaterial({
            color: 0x8B5CF6,
            roughness: 0.4,
            metalness: 0.2
          })
        );
        tileMesh.position.set(xPos, -0.9, tileZ);
        tileMesh.receiveShadow = true;
        tileMesh.castShadow = true;
        this.scene.add(tileMesh);

        const collider = this.addGroundCollider(tileMesh);

        // Sign on tile
        this.createPlatformSign(new THREE.Vector3(xPos, 0, tileZ + 3.2), badge, qIndex, opt, tileMesh);

        // Register in FallingTiles data array
        this.fallingTiles.push({
          mesh: tileMesh,
          initialY: -0.9,
          isFalling: false,
          fallSpeed: 0,
          collider,
          qIndex,
          optIndex: opt
        });

        // Responsive Floor Trigger Zone: only triggers when player steps/lands on tile
        const triggerBox = new THREE.Box3(
          new THREE.Vector3(xPos - 2.0, -0.2, tileZ - 2.0),
          new THREE.Vector3(xPos + 2.0, 2.2, tileZ + 2.8)
        );
        this.triggerZones.push({
          type: 'FLOOR',
          box: triggerBox,
          spCode: 'SP 4.4.4',
          questionGlobalIndex: qIndex,
          optionIndex: opt,
          label: `SP 4.4.4 Soalan ${qIndex + 1} Falling Tile ${badge}`
        });
      }

      // Connecting Landing Island (solid walkway to next question, no gap!)
      const landingIsland = new THREE.Mesh(
        new THREE.BoxGeometry(16, 2.5, 12),
        new THREE.MeshStandardMaterial({ map: sp4Tex, roughness: 0.6 })
      );
      landingIsland.position.set(0, -1.25, tileZ + 9.5);
      landingIsland.receiveShadow = true;
      this.scene.add(landingIsland);
      this.addGroundCollider(landingIsland);

      currentZ = tileZ + 16;
    }

    // Direct solid bridge connecting SP 4 to Victory Summit (NO GAPS!)
    const bridge4toVictory = new THREE.Mesh(
      new THREE.BoxGeometry(18, 2.5, 24),
      new THREE.MeshStandardMaterial({ map: goldTex, roughness: 0.4, metalness: 0.2 })
    );
    bridge4toVictory.position.set(0, -1.25, currentZ + 12);
    this.scene.add(bridge4toVictory);
    this.addGroundCollider(bridge4toVictory);
    this.createSideFences(currentZ, 24, 18);

    currentZ += 24;

    // =========================================================================
    // 5. VICTORY SUMMIT (FINISH LINE)
    // =========================================================================
    const finishPlatform = new THREE.Mesh(
      new THREE.BoxGeometry(26, 2.5, 42),
      new THREE.MeshStandardMaterial({ map: goldTex, roughness: 0.4, metalness: 0.2 })
    );
    finishPlatform.position.set(0, -1.25, currentZ + 18);
    finishPlatform.receiveShadow = true;
    this.scene.add(finishPlatform);
    this.addGroundCollider(finishPlatform);

    // Golden Finish Arch
    const finishArchZ = currentZ + 8;
    this.createArchway(new THREE.Vector3(0, 0, finishArchZ), 'GARISAN PENAMAT', 0xFACC15);

    // Finish Trigger Zone
    const finishBox = new THREE.Box3(
      new THREE.Vector3(-9, 0, finishArchZ - 1.5),
      new THREE.Vector3(9, 6, finishArchZ + 1.5)
    );
    this.triggerZones.push({
      type: 'FINISH',
      box: finishBox,
      spCode: 'NONE',
      questionGlobalIndex: 16,
      optionIndex: 0,
      label: 'Garisan Penamat Math Obby'
    });

    // Giant 3D Golden Trophy
    this.createVictoryTrophy(new THREE.Vector3(0, 0, currentZ + 28));

    // Confetti particles
    this.createConfettiParticles(new THREE.Vector3(0, 7, currentZ + 28));
  }

  // --- Falling Tiles Control Methods ---

  public dropTile(qIndex: number, optIndex: number) {
    const tile = this.fallingTiles.find(t => t.qIndex === qIndex && t.optIndex === optIndex);
    if (tile && !tile.isFalling) {
      tile.isFalling = true;
      tile.fallSpeed = 4.0;
      // Immediately remove from ground colliders so character plummets through!
      this.groundColliders = this.groundColliders.filter(c => c !== tile.collider);
      // Turn tile warning red
      const mat = tile.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0xEF4444);
    }
  }

  public resetFallingTiles() {
    this.fallingTiles.forEach(tile => {
      tile.isFalling = false;
      tile.fallSpeed = 0;
      tile.mesh.position.y = tile.initialY;
      tile.mesh.rotation.set(0, 0, 0);
      const mat = tile.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0x8B5CF6);
      tile.collider.box.min.set(
        tile.mesh.position.x - 2.4,
        tile.mesh.position.y - 0.9,
        tile.mesh.position.z - 4.25
      );
      tile.collider.box.max.set(
        tile.mesh.position.x + 2.4,
        tile.mesh.position.y + 0.9,
        tile.mesh.position.z + 4.25
      );
      if (!this.groundColliders.includes(tile.collider)) {
        this.groundColliders.push(tile.collider);
      }
    });
  }

  // --- Helper Builders ---

  private createSpawnCircle(pos: THREE.Vector3, colorHex: number) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.04, pos.z);
    this.scene.add(ring);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 32),
      new THREE.MeshBasicMaterial({ color: 0x0F172A, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(pos.x, pos.y + 0.03, pos.z);
    this.scene.add(inner);
  }

  private createGrandEntranceArch(pos: THREE.Vector3, title: string) {
    const archGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1E40AF, roughness: 0.3, metalness: 0.3 });

    const pGeo = new THREE.BoxGeometry(2.0, 9.0, 2.0);
    const leftP = new THREE.Mesh(pGeo, frameMat);
    leftP.position.set(-8.0, 4.5, 0);
    leftP.castShadow = true;
    archGroup.add(leftP);

    const rightP = new THREE.Mesh(pGeo, frameMat);
    rightP.position.set(8.0, 4.5, 0);
    rightP.castShadow = true;
    archGroup.add(rightP);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(18.0, 1.8, 2.2), frameMat);
    crossbar.position.set(0, 8.5, 0);
    crossbar.castShadow = true;
    archGroup.add(crossbar);

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const bCtx = bannerCanvas.getContext('2d')!;
    bCtx.fillStyle = '#0F172A';
    bCtx.fillRect(0, 0, 512, 128);
    bCtx.lineWidth = 8;
    bCtx.strokeStyle = '#38BDF8';
    bCtx.strokeRect(4, 4, 504, 120);

    bCtx.fillStyle = '#F8FAFC';
    bCtx.font = 'bold 36px Fredoka, sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText(title, 256, 64);

    const bTex = new THREE.CanvasTexture(bannerCanvas);
    bTex.colorSpace = THREE.SRGBColorSpace;

    const bannerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2.8),
      new THREE.MeshBasicMaterial({ map: bTex, side: THREE.DoubleSide })
    );
    bannerMesh.position.set(0, 6.5, 0);
    bannerMesh.rotation.y = Math.PI; // Face incoming player
    bannerMesh.scale.x = -1; // Un-mirror text so it reads left-to-right
    archGroup.add(bannerMesh);

    archGroup.position.copy(pos);
    this.scene.add(archGroup);
  }

  private createArchway(pos: THREE.Vector3, title: string, colorHex: number) {
    const archGroup = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.2 });
    const pGeo = new THREE.BoxGeometry(1.2, 7.5, 1.2);

    const leftPillar = new THREE.Mesh(pGeo, pillarMat);
    leftPillar.position.set(-7.0, 3.75, 0);
    leftPillar.castShadow = true;
    archGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pGeo, pillarMat);
    rightPillar.position.set(7.0, 3.75, 0);
    rightPillar.castShadow = true;
    archGroup.add(rightPillar);

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(15.5, 1.4, 1.4), pillarMat);
    topBeam.position.set(0, 7.2, 0);
    topBeam.castShadow = true;
    archGroup.add(topBeam);

    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 512;
    bannerCanvas.height = 128;
    const bCtx = bannerCanvas.getContext('2d')!;
    bCtx.fillStyle = '#0F172A';
    bCtx.fillRect(0, 0, 512, 128);
    bCtx.lineWidth = 8;
    bCtx.strokeStyle = '#' + colorHex.toString(16).padStart(6, '0');
    bCtx.strokeRect(4, 4, 504, 120);

    bCtx.fillStyle = '#F8FAFC';
    bCtx.font = 'bold 36px Fredoka, sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText(title, 256, 64);

    const bTex = new THREE.CanvasTexture(bannerCanvas);
    bTex.colorSpace = THREE.SRGBColorSpace;

    const bannerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({ map: bTex, side: THREE.DoubleSide })
    );
    bannerMesh.position.set(0, 5.6, 0);
    bannerMesh.rotation.y = Math.PI; // Face incoming player
    bannerMesh.scale.x = -1; // Un-mirror text so it reads left-to-right
    archGroup.add(bannerMesh);

    archGroup.position.copy(pos);
    this.scene.add(archGroup);
  }

  private createMiniArch(pos: THREE.Vector3, text: string) {
    const archGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x10B981, roughness: 0.4 });
    const pGeo = new THREE.BoxGeometry(0.8, 5.0, 0.8);

    const lP = new THREE.Mesh(pGeo, mat);
    lP.position.set(-4.5, 2.5, 0);
    archGroup.add(lP);

    const rP = new THREE.Mesh(pGeo, mat);
    rP.position.set(4.5, 2.5, 0);
    archGroup.add(rP);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.8, 0.8), mat);
    beam.position.set(0, 4.8, 0);
    archGroup.add(beam);

    archGroup.position.copy(pos);
    this.scene.add(archGroup);
  }

  private createGateArch(pos: THREE.Vector3, badge: string, qIndex: number, optIndex: number) {
    const gateGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.2 });

    const pillarGeo = new THREE.BoxGeometry(0.55, 4.6, 0.55);
    const leftP = new THREE.Mesh(pillarGeo, frameMat);
    leftP.position.set(-1.9, 2.3, 0);
    leftP.castShadow = true;
    gateGroup.add(leftP);

    const rightP = new THREE.Mesh(pillarGeo, frameMat);
    rightP.position.set(1.9, 2.3, 0);
    rightP.castShadow = true;
    gateGroup.add(rightP);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.6, 0.55), frameMat);
    topBar.position.set(0, 4.4, 0);
    topBar.castShadow = true;
    gateGroup.add(topBar);

    const signTex = createTextTexture(badge, `Pilihan ${badge}`, '#0F172A', '#10B981');
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), signMat);
    signMesh.position.set(0, 3.2, 0.1);
    signMesh.rotation.y = Math.PI; // Face incoming player
    signMesh.scale.x = -1; // Un-mirror text so it reads left-to-right
    gateGroup.add(signMesh);

    const key = `Q${qIndex}_OPT${optIndex}`;
    this.signs[key] = { mesh: signMesh, badge, qIndex, optIndex };

    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x10B981,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const portalMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.0), portalMat);
    portalMesh.position.set(0, 2.0, 0);
    gateGroup.add(portalMesh);

    gateGroup.position.copy(pos);
    this.scene.add(gateGroup);
  }

  private createPlatformSign(
    pos: THREE.Vector3,
    badge: string,
    qIndex: number,
    optIndex: number,
    parentMesh?: THREE.Mesh
  ) {
    const signTex = createTextTexture(badge, `Pilihan ${badge}`, '#0F172A', '#0EA5E9');
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), signMat);
    signMesh.rotation.y = Math.PI; // Face incoming player
    signMesh.scale.x = -1; // Un-mirror text so it reads left-to-right

    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const postMesh = new THREE.Mesh(postGeo, postMat);
    postMesh.position.y = 0.6;

    signMesh.position.y = 1.35;

    const signGroup = new THREE.Group();
    signGroup.add(postMesh);
    signGroup.add(signMesh);

    const key = `Q${qIndex}_OPT${optIndex}`;
    this.signs[key] = { mesh: signMesh, badge, qIndex, optIndex };

    if (parentMesh) {
      signGroup.position.set(0, 1.0, -0.6);
      parentMesh.add(signGroup);
    } else {
      signGroup.position.copy(pos);
      this.scene.add(signGroup);
    }
  }

  private createSideFences(startZ: number, length: number, width: number) {
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.7 });
    const halfW = width / 2;

    [-halfW, halfW].forEach(x => {
      const fenceRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.9, length),
        fenceMat
      );
      fenceRail.position.set(x, 0.65, startZ + length / 2);
      this.scene.add(fenceRail);
      this.addGroundCollider(fenceRail);
    });
  }

  private createFlagPole(pos: THREE.Vector3, text: string, colorHex: number) {
    const flagGroup = new THREE.Group();
    const poleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 5.0, 8),
      new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.8, roughness: 0.2 })
    );
    poleMesh.position.y = 2.5;
    flagGroup.add(poleMesh);

    const flagMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.1),
      new THREE.MeshStandardMaterial({ color: colorHex, side: THREE.DoubleSide, roughness: 0.4 })
    );
    flagMesh.position.set(0.9, 4.2, 0);
    flagMesh.rotation.y = Math.PI;
    flagMesh.scale.x = -1; // Un-mirror text
    flagGroup.add(flagMesh);

    flagGroup.position.copy(pos);
    this.scene.add(flagGroup);
  }

  private createVictoryTrophy(pos: THREE.Vector3) {
    const trophy = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xFACC15, metalness: 0.85, roughness: 0.15 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 4.5), goldMat);
    plinth.position.y = 0.8;
    trophy.add(plinth);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.6, 16), goldMat);
    stem.position.y = 2.6;
    trophy.add(stem);

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.3, 3.4, 16), goldMat);
    cup.position.y = 5.0;
    trophy.add(cup);

    const handleGeo = new THREE.TorusGeometry(1.3, 0.22, 8, 24, Math.PI);
    const leftHandle = new THREE.Mesh(handleGeo, goldMat);
    leftHandle.rotation.z = -Math.PI / 2;
    leftHandle.position.set(-2.4, 5.0, 0);
    trophy.add(leftHandle);

    const rightHandle = new THREE.Mesh(handleGeo, goldMat);
    rightHandle.rotation.z = Math.PI / 2;
    rightHandle.position.set(2.4, 5.0, 0);
    trophy.add(rightHandle);

    trophy.position.copy(pos);
    this.scene.add(trophy);
    this.trophyMesh = trophy;
  }

  private createConfettiParticles(pos: THREE.Vector3) {
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const palette = [
      new THREE.Color(0xF59E0B),
      new THREE.Color(0x10B981),
      new THREE.Color(0x3B82F6),
      new THREE.Color(0xEC4899),
      new THREE.Color(0x8B5CF6)
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const col = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.38,
      vertexColors: true,
      transparent: true,
      opacity: 0.95
    });

    this.confettiParticles = new THREE.Points(geo, mat);
    this.confettiParticles.position.copy(pos);
    this.confettiParticles.visible = false;
    this.scene.add(this.confettiParticles);
  }

  public updateQuestionSigns(questions: Question[]) {
    questions.forEach((q, qIndex) => {
      const spColors = {
        'SP 4.4.1': '#10B981',
        'SP 4.4.2': '#0EA5E9',
        'SP 4.4.3': '#F59E0B',
        'SP 4.4.4': '#8B5CF6'
      };
      const accent = spColors[q.spCode] || '#3B82F6';
      const badges = ['A', 'B', 'C'];

      for (let opt = 0; opt < 3; opt++) {
        const key = `Q${qIndex}_OPT${opt}`;
        const sign = this.signs[key];
        if (sign) {
          const optText = q.options[opt] || '';
          const newTex = createTextTexture(badges[opt], optText, '#0F172A', accent);
          const mat = sign.mesh.material as THREE.MeshBasicMaterial;
          if (mat.map) mat.map.dispose();
          mat.map = newTex;
          mat.needsUpdate = true;
        }
      }
    });
  }

  public showVictory() {
    if (this.confettiParticles) {
      this.confettiParticles.visible = true;
    }
  }

  public resetGame() {
    if (this.confettiParticles) {
      this.confettiParticles.visible = false;
    }
    this.resetFallingTiles();
  }

  public update(delta: number, time: number) {
    // 1. Moving platforms in SP 3
    this.movingPlatforms.forEach(p => {
      const wave = Math.sin(time * p.speed + p.offset) * p.amplitude;
      if (p.axis === 'y') {
        p.mesh.position.y = p.initialY + wave;
      } else {
        p.mesh.position.x = p.initialX + wave;
      }
      p.mesh.updateMatrixWorld();
      const halfW = 2.4;
      const halfH = 1.1;
      const halfD = 4.25;
      p.collider.box.min.set(
        p.mesh.position.x - halfW,
        p.mesh.position.y - halfH,
        p.mesh.position.z - halfD
      );
      p.collider.box.max.set(
        p.mesh.position.x + halfW,
        p.mesh.position.y + halfH,
        p.mesh.position.z + halfD
      );

      if (p.trigger) {
        const topY = p.mesh.position.y + halfH;
        p.trigger.box.min.set(
          p.mesh.position.x - 2.3,
          topY - 0.25,
          p.mesh.position.z - 3.8
        );
        p.trigger.box.max.set(
          p.mesh.position.x + 2.3,
          topY + 2.8,
          p.mesh.position.z + 3.8
        );
      }
    });

    // 2. Falling tiles animation in SP 4
    this.fallingTiles.forEach(tile => {
      if (tile.isFalling) {
        tile.fallSpeed += 32.0 * delta;
        tile.mesh.position.y -= tile.fallSpeed * delta;
        tile.mesh.rotation.x += delta * 2.5;
        tile.mesh.rotation.z += delta * 2.0;
        tile.mesh.updateMatrixWorld(true);
      }
    });

    // 3. Trophy spinning
    if (this.trophyMesh) {
      this.trophyMesh.rotation.y += delta * 1.2;
    }

    // 4. Confetti particles
    if (this.confettiParticles && this.confettiParticles.visible) {
      const posAttr = this.confettiParticles.geometry.attributes.position;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] -= delta * 3.5;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 14;
        }
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose() {
    Object.values(this.signs).forEach(s => {
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      s.mesh.geometry.dispose();
    });
  }
}
