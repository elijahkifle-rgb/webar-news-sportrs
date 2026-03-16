
import * as THREE from 'three';
import { createTextTexture } from './utils.js';
export class Scoreboard {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.sprites = {}; // store references for updates

        this._build();
        this._position();
        scene.add(this.group);
    }

    _build() {
        // Background panel
        const geometry = new THREE.PlaneGeometry(1.6, 0.8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const background = new THREE.Mesh(geometry, material);
        background.position.set(0, 0, -0.1);
        this.group.add(background);

        // Home team sprite
        const homeTex = createTextTexture('HOME', 70, '#ffffff');
        const homeMat = new THREE.SpriteMaterial({ map: homeTex, depthTest: false, depthWrite: false });
        this.sprites.home = new THREE.Sprite(homeMat);
        this.sprites.home.scale.set(0.5, 0.2, 1);
        this.sprites.home.position.set(-0.4, 0.2, 0);
        this.group.add(this.sprites.home);

        // Score sprite
        const scoreTex = createTextTexture('0 – 0', 120, '#ffff00');
        const scoreMat = new THREE.SpriteMaterial({ map: scoreTex, depthTest: false, depthWrite: false });
        this.sprites.score = new THREE.Sprite(scoreMat);
        this.sprites.score.scale.set(0.4, 0.2, 1);
        this.sprites.score.position.set(0, 0.2, 0);
        this.group.add(this.sprites.score);

        // Away team sprite
        const awayTex = createTextTexture('AWAY', 70, '#ffffff');
        const awayMat = new THREE.SpriteMaterial({ map: awayTex, depthTest: false, depthWrite: false });
        this.sprites.away = new THREE.Sprite(awayMat);
        this.sprites.away.scale.set(0.4, 0.2, 1);
        this.sprites.away.position.set(0.4, 0.2, 0);
        this.group.add(this.sprites.away);

        // Clock sprite
        const clockTex = createTextTexture('15:00', 80, '#ffffff');
        const clockMat = new THREE.SpriteMaterial({ map: clockTex, depthTest: false, depthWrite: false });
        this.sprites.clock = new THREE.Sprite(clockMat);
        this.sprites.clock.scale.set(0.3, 0.15, 1);
        this.sprites.clock.position.set(0, -0.1, 0);
        this.group.add(this.sprites.clock);

        // Period sprite
        const periodTex = createTextTexture('Q1', 60, '#cccccc');
        const periodMat = new THREE.SpriteMaterial({ map: periodTex, depthTest: false, depthWrite: false });
        this.sprites.period = new THREE.Sprite(periodMat);
        this.sprites.period.scale.set(0.2, 0.1, 1);
        this.sprites.period.position.set(0, -0.25, 0);
        this.group.add(this.sprites.period);
    }

    _position() {
        this.group.position.set(0, -0.2, -1.5);
    }

    updateScore(home, away) {
        const newTex = createTextTexture(`${home} – ${away}`, 120, '#ffff00');
        this.sprites.score.material.map.dispose();
        this.sprites.score.material.map = newTex;
    }

    updateTeamNames(homeName, awayName) {
        if (homeName) {
            const tex = createTextTexture(homeName, 70, '#ffffff');
            this.sprites.home.material.map.dispose();
            this.sprites.home.material.map = tex;
        }
        if (awayName) {
            const tex = createTextTexture(awayName, 70, '#ffffff');
            this.sprites.away.material.map.dispose();
            this.sprites.away.material.map = tex;
        }
    }

    updateClock(timeStr) {
        const tex = createTextTexture(timeStr, 80, '#ffffff');
        this.sprites.clock.material.map.dispose();
        this.sprites.clock.material.map = tex;
    }

    updatePeriod(periodStr) {
        const tex = createTextTexture(periodStr, 60, '#cccccc');
        this.sprites.period.material.map.dispose();
        this.sprites.period.material.map = tex;
    }
}