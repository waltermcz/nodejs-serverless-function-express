import * as THREE from 'three';
import BaseExperience from '../BaseExperience';
import TunnelCamera from './TunnelCamera';

// @ts-ignore
import tunnelVertex from '../../Shaders/tunnel/vertex.glsl';
// @ts-ignore
import tunnelFragment from '../../Shaders/tunnel/fragment.glsl';

export default class TunnelExperience extends BaseExperience {
    tunnelMesh: THREE.Mesh;
    tunnelCamera: TunnelCamera;
    uniforms: { [key: string]: THREE.IUniform<any> };
    savedPosition: THREE.Vector3;
    savedQuaternion: THREE.Quaternion;
    resizeHandler: () => void;

    constructor() {
        super();
        this.tunnelCamera = new TunnelCamera();
        this.savedPosition  = new THREE.Vector3();
        this.savedQuaternion = new THREE.Quaternion();

        this.uniforms = {
            uTime:       { value: 0 },
            uMouse:      { value: new THREE.Vector2() },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uSpeed:      { value: 0.6 },
            uColorA:     { value: new THREE.Color('#0a0a2e') },
            uColorB:     { value: new THREE.Color('#00ffcc') },
            uColorC:     { value: new THREE.Color('#ff00ff') },
            uTwist:      { value: 1.8 },
            uRings:      { value: 12.0 },
        };

        this.resizeHandler = () => {
            this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        };
    }

    load(onReady: () => void): void {
        this.buildTunnel();
        onReady();
    }

    buildTunnel(): void {
        const geometry = new THREE.PlaneGeometry(20000, 20000);
        const material = new THREE.ShaderMaterial({
            vertexShader:   tunnelVertex,
            fragmentShader: tunnelFragment,
            uniforms:       this.uniforms,
            depthTest:      false,
            depthWrite:     false,
            transparent:    true,
        });

        this.tunnelMesh = new THREE.Mesh(geometry, material);
        this.tunnelMesh.position.set(0, 0, -5000);
        this.tunnelMesh.renderOrder = 999;
        this.experienceScene.add(this.tunnelMesh);
    }

    start(): void {
        // Save camera state
        this.savedPosition.copy(this.application.camera.instance.position);
        this.savedQuaternion.copy(this.application.camera.instance.quaternion);

        // Place camera at origin looking into the tunnel
        this.application.camera.instance.position.set(0, 0, 0);
        this.application.camera.instance.lookAt(0, 0, -1);

        this.addToScene();
        this.tunnelCamera.attach();
        window.addEventListener('resize', this.resizeHandler);
    }

    update(): void {
        this.uniforms.uTime.value = this.application.time.elapsed;
        this.uniforms.uMouse.value.set(
            this.tunnelCamera.currentTilt.x,
            this.tunnelCamera.currentTilt.y
        );
        this.tunnelCamera.update(this.application.camera.instance);
    }

    destroy(): void {
        this.tunnelCamera.detach();
        window.removeEventListener('resize', this.resizeHandler);
        // Restore camera
        this.application.camera.instance.position.copy(this.savedPosition);
        this.application.camera.instance.quaternion.copy(this.savedQuaternion);
        this.removeFromScene();
    }
}
