import * as THREE from 'three';
import BaseExperience from '../BaseExperience';
import GalaxyCamera from './GalaxyCamera';

// @ts-ignore
import galaxyVertex from '../../Shaders/galaxy/vertex.glsl';
// @ts-ignore
import galaxyFragment from '../../Shaders/galaxy/fragment.glsl';

const PARTICLE_COUNT = 80000;
const GALAXY_RADIUS = 6000;
const ARM_TWIST = 2.2;
const ARM_COUNT = 2;

export default class GalaxyExperience extends BaseExperience {
    particleSystem: THREE.Points;
    starField: THREE.Points;
    starSystems: THREE.Mesh[];
    galaxyCamera: GalaxyCamera;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    uniforms: { [key: string]: THREE.IUniform<any> };
    clickHandler: (e: MouseEvent) => void;

    constructor() {
        super();
        this.starSystems = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.galaxyCamera = new GalaxyCamera();

        this.uniforms = {
            uTime:        { value: 0 },
            uGalaxyRadius: { value: GALAXY_RADIUS },
            uArmTwist:    { value: ARM_TWIST },
        };

        this.clickHandler = (e: MouseEvent) => this.onMouseClick(e);
    }

    load(onReady: () => void): void {
        this.buildGalaxy();
        this.buildStarField();
        this.buildStarSystems();
        onReady();
    }

    buildGalaxy(): void {
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors    = new Float32Array(PARTICLE_COUNT * 3);
        const sizes     = new Float32Array(PARTICLE_COUNT);

        const innerColor = new THREE.Color('#ffd4a3');
        const outerColor = new THREE.Color('#3a6bc9');
        const c = new THREE.Color();

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            const branch   = i % ARM_COUNT;
            const radius   = Math.random() * GALAXY_RADIUS;
            const spin     = (radius / GALAXY_RADIUS) * ARM_TWIST;
            const angle    = (branch / ARM_COUNT) * Math.PI * 2 + spin;
            const scatter  = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1);

            positions[i3]     = Math.cos(angle) * radius + scatter * 400;
            positions[i3 + 1] = scatter * 80;
            positions[i3 + 2] = Math.sin(angle) * radius + scatter * 400;

            c.lerpColors(innerColor, outerColor, radius / GALAXY_RADIUS);
            colors[i3]     = c.r;
            colors[i3 + 1] = c.g;
            colors[i3 + 2] = c.b;

            sizes[i] = Math.random() * 15 + 5;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            vertexShader:   galaxyVertex,
            fragmentShader: galaxyFragment,
            uniforms:       this.uniforms,
            transparent:    true,
            depthWrite:     false,
            blending:       THREE.AdditiveBlending,
            vertexColors:   true,
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.experienceScene.add(this.particleSystem);
    }

    buildStarField(): void {
        const count = 10000;
        const positions = new Float32Array(count * 3);
        const FIELD_RADIUS = 40000;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3]     = (Math.random() - 0.5) * FIELD_RADIUS * 2;
            positions[i3 + 1] = (Math.random() - 0.5) * FIELD_RADIUS;
            positions[i3 + 2] = (Math.random() - 0.5) * FIELD_RADIUS * 2;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 8,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.6,
        });

        this.starField = new THREE.Points(geometry, material);
        this.experienceScene.add(this.starField);
    }

    buildStarSystems(): void {
        const starPositions = [
            new THREE.Vector3(3500, 200, 1200),
            new THREE.Vector3(-2800, -100, 3000),
            new THREE.Vector3(1000, 300, -3800),
        ];

        const starColors = [0xffffaa, 0xaaeeff, 0xffccaa];

        starPositions.forEach((pos, i) => {
            // Core sphere
            const geo = new THREE.SphereGeometry(80, 16, 16);
            const mat = new THREE.MeshBasicMaterial({
                color: starColors[i],
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            this.experienceScene.add(mesh);
            this.starSystems.push(mesh);

            // Glow halo ring
            const ringGeo = new THREE.RingGeometry(110, 180, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: starColors[i],
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.25,
                blending: THREE.AdditiveBlending,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            this.experienceScene.add(ring);
        });
    }

    onMouseClick(e: MouseEvent): void {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.application.camera.instance);
        const hits = this.raycaster.intersectObjects(this.starSystems);
        if (hits.length > 0) {
            this.galaxyCamera.warpTo(hits[0].object.position, this.application.camera.instance);
        }
    }

    start(): void {
        this.addToScene();
        document.addEventListener('click', this.clickHandler);
    }

    update(): void {
        const elapsed = this.application.time.elapsed;
        this.uniforms.uTime.value = elapsed;
        this.galaxyCamera.update(elapsed, this.application.camera.instance);
    }

    destroy(): void {
        document.removeEventListener('click', this.clickHandler);
        this.removeFromScene();
    }
}
