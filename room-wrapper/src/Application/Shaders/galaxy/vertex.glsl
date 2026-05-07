uniform float uTime;
uniform float uGalaxyRadius;
uniform float uArmTwist;

attribute float aSize;
attribute vec3 color;

varying vec3 vColor;

void main() {
    vColor = color;

    float radius = length(position.xz);
    float rotSpeed = uTime * 0.000003 * (1.0 - radius / uGalaxyRadius);
    float cosR = cos(rotSpeed);
    float sinR = sin(rotSpeed);

    vec3 rotated = position;
    rotated.x = position.x * cosR - position.z * sinR;
    rotated.z = position.x * sinR + position.z * cosR;

    vec4 mvPosition = modelViewMatrix * vec4(rotated, 1.0);
    gl_PointSize = aSize * (3000.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
