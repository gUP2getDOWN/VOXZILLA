import * as THREE from 'three';
import { Voxel, Vector3, GameConfig, Player } from '../types';

export class VoxzillaGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private dangerZones: THREE.Group = new THREE.Group();
  private ground: THREE.Mesh | null = null;
  private ghostVoxel: THREE.Mesh | null = null;
  private highlightVoxel: THREE.LineSegments | null = null;
  private voxels: Voxel[] = [];
  private config: GameConfig;
  private playerId: string;
  private players: Player[] = [];
  private selectedColor: string = '#4cc9f0';
  private currentTargetVoxel: Voxel | null = null;
  private currentTargetPos: Vector3 | null = null;
  
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private moveUp = false;
  private moveDown = false;
  
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  
  public onTargetChange: (voxel: Voxel | null, pos: Vector3 | null, isRestricted: boolean) => void = () => {};
  public onPlace: (pos: Vector3) => void = () => {};
  public onAttack: (voxelId: string) => void = () => {};

  constructor(container: HTMLElement, config: GameConfig, playerId: string) {
    this.config = config;
    this.playerId = playerId;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 90);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(50, 100, 50);
    this.scene.add(sunLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(config.worldSize, config.worldSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.scene.add(this.ground);

    // Grid
    const grid = new THREE.GridHelper(config.worldSize, config.worldSize, 0x888888, 0xaaaaaa);
    grid.position.y = -0.49;
    this.scene.add(grid);

    // Ghost Voxel
    const ghostGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const ghostMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.3,
      depthWrite: false
    });
    this.ghostVoxel = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostVoxel.visible = false;
    this.ghostVoxel.raycast = () => {}; // Prevent ghost from blocking raycasts
    this.scene.add(this.ghostVoxel);

    this.scene.add(this.dangerZones);

    // Highlight Voxel (for targeting)
    const boxGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const highlightGeo = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    const highlightMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.8
    });
    this.highlightVoxel = new THREE.LineSegments(highlightGeo, highlightMat);
    this.highlightVoxel.visible = false;
    this.highlightVoxel.raycast = () => {};
    this.scene.add(this.highlightVoxel);

    this.setupControls();
    this.animate();

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupControls() {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'Space': this.moveUp = true; break;
        case 'ShiftLeft': this.moveDown = true; break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'Space': this.moveUp = false; break;
        case 'ShiftLeft': this.moveDown = false; break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Pointer lock
    this.renderer.domElement.addEventListener('mousedown', (event) => {
      const wasLocked = document.pointerLockElement === this.renderer.domElement;
      if (!wasLocked) {
        this.renderer.domElement.requestPointerLock();
      }

    // Raycast again to get current target at moment of click
    const { voxel, pos } = this.getRaycastTarget();

    if (event.button === 0) { // Left Click - Place
      if (pos) {
        console.log('Requesting placement at:', pos);
        this.onPlace(pos);
      }
    } else if (event.button === 2) { // Right Click - Attack
      if (voxel) {
        console.log('Requesting attack on:', voxel.id);
        this.onAttack(voxel.id);
      }
    }
  });

    // Disable context menu for right click
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse wheel zoom
    this.renderer.domElement.addEventListener('wheel', (event) => {
      const zoomSpeed = 0.5;
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      
      if (event.deltaY < 0) {
        // Zoom in
        this.camera.position.addScaledVector(direction, zoomSpeed);
      } else {
        // Zoom out
        this.camera.position.addScaledVector(direction, -zoomSpeed);
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.camera.rotation.y -= movementX * 0.002;
        this.camera.rotation.x -= movementY * 0.002;
        this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
      }
    });

    this.camera.rotation.order = 'YXZ';
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public setConfig(config: GameConfig) {
    this.config = config;
    this.updateDangerZones();
  }

  public setSelectedColor(color: string) {
    this.selectedColor = color;
  }

  public moveCameraTo(x: number, z: number) {
    this.camera.position.x = x;
    this.camera.position.z = z;
    // Keep camera at a reasonable height and looking down slightly
    this.camera.position.y = Math.max(this.camera.position.y, 5);
  }

  public updateState(voxels: Voxel[], players: Player[]) {
    this.voxels = voxels;
    this.players = players;
    this.updateInstancedMesh();
    this.updateDangerZones();
  }

  private updateDangerZones() {
    // Clear existing
    while (this.dangerZones.children.length > 0) {
      const child = this.dangerZones.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      this.dangerZones.remove(child);
    }

    const currentPlayer = this.players.find(p => p.id === this.playerId);
    const range = this.config.buildBuffer;
    if (range <= 0) return;

    const bufferSize = range * 2 + 1;
    const dangerGeo = new THREE.BoxGeometry(bufferSize, bufferSize, bufferSize);
    const dangerMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.BackSide // Only show back faces to avoid clipping with voxels
    });

    // Only show danger zones for enemy voxels
    for (const v of this.voxels) {
      const owner = this.players.find(p => p.id === v.ownerId);
      const isEnemy = v.ownerId !== this.playerId && 
                     (!currentPlayer?.teamId || owner?.teamId !== currentPlayer.teamId);
      
      if (isEnemy) {
        const zone = new THREE.Mesh(dangerGeo, dangerMat);
        zone.position.set(v.pos.x, v.pos.y, v.pos.z);
        zone.raycast = () => {}; // Don't block raycasts
        this.dangerZones.add(zone);
      }
    }
  }

  private updateInstancedMesh() {
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    
    const visibleVoxels = this.voxels;

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, visibleVoxels.length);
    
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    visibleVoxels.forEach((v, i) => {
      matrix.setPosition(v.pos.x, v.pos.y, v.pos.z);
      this.instancedMesh!.setMatrixAt(i, matrix);

      // Color based on owner or custom color
      if (v.color) {
        color.set(v.color);
      } else if (v.ownerId === this.playerId) {
        color.set(0x4cc9f0); // Blue
      } else {
        color.set(0xf72585); // Pink/Red
      }
      
      // Darken based on height
      const heightFactor = v.pos.y / this.config.maxHeight;
      color.multiplyScalar(1 - heightFactor * 0.5);

      // Glow for height > 40
      if (v.pos.y > 40) {
        color.add(new THREE.Color(0x00ff00).multiplyScalar(0.2));
      }

      this.instancedMesh!.setColorAt(i, color);
    });

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    
    this.scene.add(this.instancedMesh);
  }

  private getRaycastTarget(): { voxel: Voxel | null, pos: Vector3 | null } {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = [];
    if (this.instancedMesh) targets.push(this.instancedMesh);
    if (this.ground) targets.push(this.ground);
    
    const intersects = this.raycaster.intersectObjects(targets);
    
    let targetVoxel: Voxel | null = null;
    let targetPos: Vector3 | null = null;

    if (intersects.length > 0) {
      const intersect = intersects[0];
      if (intersect.object === this.instancedMesh && intersect.instanceId !== undefined) {
        targetVoxel = this.voxels[intersect.instanceId] || null;
        
        if (targetVoxel) {
          const normal = intersect.face?.normal.clone().applyQuaternion(intersect.object.quaternion);
          if (normal) {
            targetPos = {
              x: targetVoxel.pos.x + normal.x,
              y: Math.round(targetVoxel.pos.y + normal.y),
              z: targetVoxel.pos.z + normal.z
            };
          }
        }
      } else if (intersect.object === this.ground) {
        targetPos = {
          x: Math.floor(intersect.point.x) + 0.5,
          y: 0,
          z: Math.floor(intersect.point.z) + 0.5
        };
      }
    }

    // Bounds check
    if (targetPos) {
      const halfSize = this.config.worldSize / 2;
      if (Math.abs(targetPos.x) > halfSize || Math.abs(targetPos.z) > halfSize || targetPos.y < 0 || targetPos.y >= this.config.maxHeight) {
        targetPos = null;
      }
    }

    return { voxel: targetVoxel, pos: targetPos };
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));

    if (this.config.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = this.clock.getDelta();

    // Movement
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;
    this.velocity.y -= this.velocity.y * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.y = Number(this.moveUp) - Number(this.moveDown);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * 400.0 * delta;
    if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * 400.0 * delta;
    if (this.moveUp || this.moveDown) this.velocity.y -= this.direction.y * 400.0 * delta;

    this.camera.translateX(-this.velocity.x * delta);
    this.camera.translateZ(-this.velocity.z * delta);
    this.camera.translateY(-this.velocity.y * delta);

    // Raycasting for targeting
    const { voxel, pos } = this.getRaycastTarget();
    this.currentTargetVoxel = voxel;
    this.currentTargetPos = pos;

    this.onTargetChange(this.currentTargetVoxel, this.currentTargetPos, false);

    // Update Highlight
    if (this.highlightVoxel) {
      if (this.currentTargetVoxel) {
        this.highlightVoxel.position.set(
          this.currentTargetVoxel.pos.x,
          this.currentTargetVoxel.pos.y,
          this.currentTargetVoxel.pos.z
        );
        this.highlightVoxel.visible = true;
      } else {
        this.highlightVoxel.visible = false;
      }
    }

    if (this.ghostVoxel) {
      if (this.currentTargetPos) {
        // Build restriction check
        let isRestricted = false;
        const range = this.config.buildBuffer;
        const currentPlayer = this.players.find(p => p.id === this.playerId);

        for (const v of this.voxels) {
          const dx = Math.abs(v.pos.x - this.currentTargetPos.x);
          const dy = Math.abs(v.pos.y - this.currentTargetPos.y);
          const dz = Math.abs(v.pos.z - this.currentTargetPos.z);

          if (dx <= range && dy <= range && dz <= range) {
            const owner = this.players.find(p => p.id === v.ownerId);
            const isEnemy = v.ownerId !== this.playerId && 
                           (!currentPlayer?.teamId || owner?.teamId !== currentPlayer.teamId);
            
            if (isEnemy) {
              isRestricted = true;
              break;
            }
          }
        }

        this.ghostVoxel.position.set(this.currentTargetPos.x, this.currentTargetPos.y, this.currentTargetPos.z);
        this.ghostVoxel.visible = true;

        if (isRestricted) {
          (this.ghostVoxel.material as THREE.MeshStandardMaterial).color.set(0xff0000);
          (this.ghostVoxel.material as THREE.MeshStandardMaterial).opacity = 0.5;
        } else {
          (this.ghostVoxel.material as THREE.MeshStandardMaterial).color.set(this.selectedColor);
          (this.ghostVoxel.material as THREE.MeshStandardMaterial).opacity = 0.3;
        }

        this.onTargetChange(this.currentTargetVoxel, this.currentTargetPos, isRestricted);
      } else {
        this.ghostVoxel.visible = false;
        this.onTargetChange(this.currentTargetVoxel, null, false);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public getCamera() { return this.camera; }

  public requestLock() {
    this.renderer.domElement.requestPointerLock();
  }

  public isLocked() {
    return document.pointerLockElement === this.renderer.domElement;
  }
}
