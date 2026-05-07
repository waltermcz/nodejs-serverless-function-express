import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

export default class GalaxyCamera {
    orbitAngle: number;
    orbitRadius: number;
    orbitSpeed: number;
    orbitHeight: number;
    orbitHeightOscillation: number;
    isWarping: boolean;

    constructor() {
        this.orbitAngle = 0;
        this.orbitRadius = 9000;
        this.orbitSpeed = 0.00012;
        this.orbitHeight = 5000;
        this.orbitHeightOscillation = 1200;
        this.isWarping = false;
    }

    warpTo(target: THREE.Vector3, camera: THREE.PerspectiveCamera): void {
        this.isWarping = true;

        const pos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const dest = { x: target.x * 0.3, y: target.y + 400, z: target.z * 0.3 };

        new TWEEN.Tween(pos)
            .to(dest, 2000)
            .easing(TWEEN.Easing.Exponential.InOut)
            .onUpdate(() => {
                camera.position.set(pos.x, pos.y, pos.z);
                camera.lookAt(target);
            })
            .onComplete(() => {
                this.isWarping = false;
            })
            .start();
    }

    update(elapsed: number, camera: THREE.PerspectiveCamera): void {
        if (this.isWarping) return;

        this.orbitAngle += this.orbitSpeed;

        const x = Math.sin(this.orbitAngle) * this.orbitRadius;
        const y = this.orbitHeight + Math.sin(elapsed * 0.0001) * this.orbitHeightOscillation;
        const z = Math.cos(this.orbitAngle) * this.orbitRadius;

        camera.position.set(x, y, z);
        camera.lookAt(0, 0, 0);
    }
}
