import * as THREE from 'three';
import Application from '../Application';

export default abstract class BaseExperience {
    application: Application;
    scene: THREE.Scene;
    experienceScene: THREE.Group;

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.experienceScene = new THREE.Group();
    }

    abstract load(onReady: () => void): void;
    abstract start(): void;
    abstract update(): void;
    abstract destroy(): void;

    protected addToScene(): void {
        this.scene.add(this.experienceScene);
    }

    protected removeFromScene(): void {
        this.scene.remove(this.experienceScene);
        this.disposeGroup(this.experienceScene);
    }

    protected disposeGroup(group: THREE.Group): void {
        group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}
