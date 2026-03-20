
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export function loadModel(url, position, scale = 1, color = null, scene) {
    loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.position.copy(position);
        model.scale.set(scale, scale, scale);

        if (color) {
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material.color.setHex(color);
                }
            });
        }

        scene.add(model);
        console.log('Model loaded:', url);
    }, undefined, (error) => {
        console.error('Error loading model:', error);
    });
}