import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { Scoreboard } from './scoreboard.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// AR button
document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

// Scoreboard (will be placed on tap)
let scoreboard = null;
let hitTestSource = null;
let reticle = null;

// Reticle (white ring)
const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
reticle = new THREE.Mesh(ringGeo, ringMat);
reticle.visible = false;
scene.add(reticle);

// Setup hit test source when session starts
renderer.xr.addEventListener('sessionstart', async (session) => {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
});

// Tap to place scoreboard
renderer.xr.addEventListener('select', async () => {
    if (scoreboard) return;
    const frame = renderer.xr.getFrame();
    if (!frame || !hitTestSource) return;
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length === 0) return;
    const hit = hits[0];
    const pose = hit.getPose(frame.getReferenceSpace('local-floor'));
    if (!pose) return;
    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const pos = new THREE.Vector3().setFromMatrixPosition(matrix);

    scoreboard = new Scoreboard(scene, 'https://football-api-worker.webar-football.workers.dev');
    scoreboard.group.position.copy(pos);
    scoreboard.group.position.y += 0.1;
    scoreboard.fetchAndUpdate(552077);
    reticle.visible = false;
});

// Animation loop: update reticle position
function animate() {
    renderer.setAnimationLoop(() => {
        const frame = renderer.xr.getFrame();
        if (frame && hitTestSource && !scoreboard) {
            const hits = frame.getHitTestResults(hitTestSource);
            if (hits.length > 0) {
                const pose = hits[0].getPose(frame.getReferenceSpace('local-floor'));
                if (pose) {
                    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
                    reticle.position.setFromMatrixPosition(matrix);
                    reticle.visible = true;
                } else {
                    reticle.visible = false;
                }
            } else {
                reticle.visible = false;
            }
        }
        renderer.render(scene, camera);
    });
}
animate();