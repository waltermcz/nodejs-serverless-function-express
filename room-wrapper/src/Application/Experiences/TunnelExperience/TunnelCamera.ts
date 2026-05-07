import * as THREE from 'three';

export default class TunnelCamera {
    targetTilt: THREE.Vector2;
    currentTilt: THREE.Vector2;
    tiltStrength: number;
    mouseMoveHandler: (e: MouseEvent) => void;

    constructor() {
        this.targetTilt  = new THREE.Vector2();
        this.currentTilt = new THREE.Vector2();
        this.tiltStrength = 0.08;
        this.mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
    }

    attach(): void {
        document.addEventListener('mousemove', this.mouseMoveHandler);
    }

    detach(): void {
        document.removeEventListener('mousemove', this.mouseMoveHandler);
    }

    onMouseMove(e: MouseEvent): void {
        this.targetTilt.x =  (e.clientX / window.innerWidth  - 0.5) * 2;
        this.targetTilt.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    }

    update(camera: THREE.PerspectiveCamera): void {
        this.currentTilt.x += (this.targetTilt.x - this.currentTilt.x) * 0.04;
        this.currentTilt.y += (this.targetTilt.y - this.currentTilt.y) * 0.04;

        camera.rotation.y = this.currentTilt.x * this.tiltStrength;
        camera.rotation.x = this.currentTilt.y * this.tiltStrength * 0.5;
    }
}
