import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import type { Tween } from '@tweenjs/tween.js';
import Application from './Application';
import BaseExperience from './Experiences/BaseExperience';
import GalaxyExperience from './Experiences/GalaxyExperience/GalaxyExperience';
import TunnelExperience from './Experiences/TunnelExperience/TunnelExperience';
import UIEventBus from './UI/EventBus';

type MaterialSnapshot = {
    material: THREE.Material;
    originalOpacity: number;
    originalTransparent: boolean;
};

export default class SceneManager {
    application: Application;
    activeExperience: BaseExperience | null;
    deskObjects: THREE.Object3D[];
    materialSnapshots: MaterialSnapshot[];
    fadeOpacity: { value: number };
    fadeTween: Tween<{ value: number }> | null;
    experienceRegistry: Map<string, new () => BaseExperience>;

    constructor() {
        this.application = new Application();
        this.activeExperience = null;
        this.deskObjects = [];
        this.materialSnapshots = [];
        this.fadeOpacity = { value: 1 };
        this.fadeTween = null;

        this.experienceRegistry = new Map();
        this.experienceRegistry.set('galaxy', GalaxyExperience);
        this.experienceRegistry.set('tunnel', TunnelExperience);

        this.collectDeskObjects();

        UIEventBus.on('launchExperience', (data: { id: string }) => {
            this.launch(data.id);
        });

        UIEventBus.on('exitExperience', () => {
            this.exit();
        });
    }

    collectDeskObjects(): void {
        this.deskObjects = [...this.application.scene.children];

        // Snapshot each material's original opacity so fadeDeskIn restores
        // to the correct value (e.g. the CSS3D occluder plane stays at 0).
        this.materialSnapshots = [];
        this.deskObjects.forEach((obj) => {
            obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.Material;
                    if (mat) {
                        this.materialSnapshots.push({
                            material: mat,
                            originalOpacity: mat.opacity,
                            originalTransparent: mat.transparent,
                        });
                    }
                }
            });
        });
    }

    launch(id: string): void {
        if (this.activeExperience) return;

        const ExperienceClass = this.experienceRegistry.get(id);
        if (!ExperienceClass) return;

        UIEventBus.dispatch('experienceLaunching', { id });

        this.fadeDeskOut(() => {
            // Hand camera control to the experience before it starts
            this.application.camera.externalControl = true;

            const experience = new ExperienceClass();
            this.activeExperience = experience;

            experience.load(() => {
                experience.start();
                UIEventBus.dispatch('experienceLaunched', { id });
            });
        });
    }

    exit(): void {
        if (!this.activeExperience) return;

        this.activeExperience.destroy();
        this.activeExperience = null;

        // Return camera control to Camera.ts before fading the desk back in
        this.application.camera.externalControl = false;

        this.fadeDeskIn();
        UIEventBus.dispatch('experienceExited', {});
    }

    fadeDeskOut(callback: () => void): void {
        if (this.fadeTween) this.fadeTween.stop();
        this.fadeOpacity.value = 1;

        this.fadeTween = new TWEEN.Tween(this.fadeOpacity)
            .to({ value: 0 }, 800)
            .easing(TWEEN.Easing.Quadratic.In)
            .onUpdate(() => this.setDeskSceneOpacity(this.fadeOpacity.value))
            .onComplete(() => {
                this.fadeTween = null;
                callback();
            })
            .start();
    }

    fadeDeskIn(): void {
        if (this.fadeTween) this.fadeTween.stop();
        this.fadeOpacity.value = 0;

        this.fadeTween = new TWEEN.Tween(this.fadeOpacity)
            .to({ value: 1 }, 1000)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => this.setDeskSceneOpacity(this.fadeOpacity.value))
            .onComplete(() => {
                this.fadeTween = null;
            })
            .start();
    }

    setDeskSceneOpacity(opacity: number): void {
        // Multiply each material's original opacity by the fade factor so
        // materials that started at opacity=0 (e.g. the CSS3D occluder plane)
        // are never accidentally made visible.
        for (const snap of this.materialSnapshots) {
            snap.material.transparent = true;
            snap.material.opacity = snap.originalOpacity * opacity;
        }
    }

    update(): void {
        if (this.activeExperience) {
            this.activeExperience.update();
        }
    }
}
