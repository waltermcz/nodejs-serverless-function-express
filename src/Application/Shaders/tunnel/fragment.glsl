uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uResolution;
uniform float uSpeed;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform float uTwist;
uniform float uRings;

varying vec2 vUv;

void main() {
    vec2 uv = vUv - 0.5;

    // Mouse-driven head-tilt — offset applied before polar conversion
    float r0 = length(uv);
    uv += uMouse * 0.04 * (1.0 - r0 * 2.0);

    float radius = length(uv);
    if (radius < 0.001) radius = 0.001;

    float angle = atan(uv.y, uv.x)
                  + uTwist * uTime * uSpeed * 0.00015;

    float depth = 0.5 / radius;
    float rings = fract(depth * uRings - uTime * uSpeed * 0.002);

    float hex   = abs(sin(angle * 6.0 + uTime * uSpeed * 0.0008));
    float spoke = abs(sin(angle * 12.0));

    float glow  = pow(1.0 - rings, 3.0);
    float glow2 = pow(rings, 5.0);

    vec3 col = mix(uColorA, uColorB, glow);
    col      = mix(col, uColorC, glow2 * hex);
    col     += vec3(spoke * 0.04);

    // Vignette — fade outer edge to black
    float vign   = 1.0 - smoothstep(0.3, 0.5, radius);
    // Bright bloom at exact center
    float center = 1.0 - smoothstep(0.0, 0.05, radius);
    col = col * vign + vec3(1.0, 0.98, 0.95) * center * 0.8;

    // Subtle chromatic aberration on red channel at edges
    float aberr    = smoothstep(0.25, 0.5, radius) * 0.015;
    float rChannel = fract((depth + aberr) * uRings - uTime * uSpeed * 0.002);
    col.r          = mix(col.r, pow(1.0 - rChannel, 3.0) * uColorB.r, 0.3 * aberr * 20.0);

    gl_FragColor = vec4(col, 1.0);
}
