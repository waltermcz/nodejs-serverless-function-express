uniform float uTime;

varying vec3 vColor;

void main() {
    float distFromCenter = length(gl_PointCoord - vec2(0.5));
    if (distFromCenter > 0.5) discard;

    float strength = 1.0 - (distFromCenter * 2.0);
    strength = pow(strength, 2.5);

    float twinkle = 0.92 + 0.08 * sin(uTime * 0.002 + gl_FragCoord.x * 0.1 + gl_FragCoord.y * 0.07);

    gl_FragColor = vec4(vColor * strength * twinkle, strength);
}
