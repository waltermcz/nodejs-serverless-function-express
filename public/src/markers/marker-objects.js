/**
 * marker-objects.js
 * Defines the A-Frame entities rendered on top of each AR marker.
 *
 * Exports:
 *   getMarkerTemplate() → string   – inner HTML for the <a-marker> element
 *   attachMarkerModels(scene)       – appends dynamic models after scene loads
 */

/** Returns the static entity HTML to embed inside the marker. */
export function getMarkerTemplate() {
  return `
    <a-marker type="pattern" url="assets/markers/sample.patt">
      <a-entity
        geometry="primitive: box; depth: 0.5; height: 0.5; width: 0.5"
        material="color: #e25822; opacity: 0.85"
        position="-0.5 0.25 0"
        animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear"
      ></a-entity>
    </a-marker>
  `;
}

/** Appends the Duck glTF model to the marker after the scene has loaded. */
export function attachMarkerModels(scene) {
  const marker = scene.querySelector('a-marker');
  const model = document.createElement('a-entity');
  model.setAttribute('gltf-model', 'url(https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb)');
  model.setAttribute('position', '0.5 0 0');
  model.setAttribute('scale', '0.1 0.1 0.1');
  marker.appendChild(model);
}
